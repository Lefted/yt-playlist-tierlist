import { error, fail } from '@sveltejs/kit';
import {
	createInvite,
	INVITE_TTL_DAYS,
	inviteTtlDays,
	listInvites,
	revokeInvite
} from '$lib/server/auth/invites.js';
import { deleteSessionsOfUser } from '$lib/server/auth/sessions.js';
import {
	countActiveAdmins,
	emailProblem,
	listUsers,
	normalizeEmail,
	setUserDisabled
} from '$lib/server/auth/users.js';
import { serverConfig } from '$lib/server/config.js';
import { getDb } from '$lib/server/db/index.js';

/**
 * Only admins, and the check lives here rather than in `hooks.server.js`.
 *
 * The hook answers one question for the whole app — "is there a session?" — and
 * adding per-route roles to it would put the rules for `/admin` somewhere other than
 * `/admin`. A 403 rather than a 404: the person asking is signed in and known, and
 * pretending the page does not exist would only make them wonder.
 *
 * @param {App.Locals} locals
 * @returns {void}
 */
function requireAdmin(locals) {
	if (locals.user?.role !== 'admin') error(403, 'This page is for admins.');
}

/**
 * Everyone who has an account, and every invite that has ever been made.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ locals }) {
	requireAdmin(locals);

	const db = getDb();
	const [users, invites] = await Promise.all([listUsers(db), listInvites(db)]);

	return { users, invites, defaultTtlDays: INVITE_TTL_DAYS };
}

/** @satisfies {import('./$types').Actions} */
export const actions = {
	/**
	 * Mint an invite link.
	 *
	 * The token comes back in the action result and is rendered once; it is never
	 * stored in a form that could be replayed, and `/admin` cannot show it again after
	 * a reload, because the database only has its hash.
	 *
	 * @type {import('./$types').Action}
	 */
	createInvite: async ({ locals, request, url }) => {
		requireAdmin(locals);

		const data = await request.formData();
		const email = normalizeEmail(data.get('email'));
		const ttlDays = inviteTtlDays(data.get('ttlDays'));

		// The address is optional; supplying a broken one is still a mistake worth
		// reporting rather than silently dropping.
		if (email !== '') {
			const problem = emailProblem(email);
			if (problem) return fail(400, { action: 'createInvite', message: problem });
		}

		const { token, expiresAt } = await createInvite(getDb(), {
			createdBy: /** @type {App.Locals['user']} */ (locals.user).id,
			email: email === '' ? null : email,
			ttlDays
		});

		// Built here rather than from `location.origin` in the browser: `ORIGIN` is what
		// the installation calls itself, and an admin reaching the app by some other
		// hostname would otherwise copy a link that only works for them. It falls back
		// to the request's own origin, because `ORIGIN` is optional in development.
		const base = serverConfig().origin ?? url.origin;

		return {
			action: 'createInvite',
			link: `${base}/invite/${token}`,
			expiresAt: expiresAt.toISOString()
		};
	},

	/**
	 * Throw away an invite nobody has redeemed.
	 *
	 * @type {import('./$types').Action}
	 */
	revokeInvite: async ({ locals, request }) => {
		requireAdmin(locals);

		const data = await request.formData();
		const id = String(data.get('inviteId') ?? '');
		if (!id) return fail(400, { action: 'revokeInvite', message: 'No invite was named.' });

		// One answer for "no such invite" and "already redeemed": both mean there is
		// nothing left to revoke, and a used invite is kept on purpose as the record of
		// who joined on whose invitation.
		const removed = await revokeInvite(getDb(), id);
		if (!removed) {
			return fail(404, {
				action: 'revokeInvite',
				message: 'That invite is already gone, or has already been used.'
			});
		}

		return { action: 'revokeInvite' };
	},

	/**
	 * Turn an account off or back on.
	 *
	 * Disabling deletes that user's sessions, which is what makes it take effect on
	 * their very next request rather than in thirty days — the reason sessions are in
	 * the database at all.
	 *
	 * @type {import('./$types').Action}
	 */
	setDisabled: async ({ locals, request }) => {
		requireAdmin(locals);

		const data = await request.formData();
		const userId = String(data.get('userId') ?? '');
		const disabled = data.get('disabled') === 'true';
		const me = /** @type {App.Locals['user']} */ (locals.user);

		if (!userId) return fail(400, { action: 'setDisabled', message: 'No account was named.' });

		if (disabled && userId === me.id) {
			return fail(400, {
				action: 'setDisabled',
				message: 'You cannot disable your own account.'
			});
		}

		const db = getDb();

		// An installation with no admin who can sign in has no way back except
		// `npm run user:set-password` on the server, so the last one is protected.
		if (disabled && (await countActiveAdmins(db)) <= 1) {
			const targets = await listUsers(db);
			const target = targets.find((user) => user.id === userId);
			if (target?.role === 'admin' && !target.disabledAt) {
				return fail(400, {
					action: 'setDisabled',
					message: 'This is the last admin who can still sign in.'
				});
			}
		}

		await setUserDisabled(db, userId, disabled);
		if (disabled) await deleteSessionsOfUser(db, userId);

		return { action: 'setDisabled' };
	}
};
