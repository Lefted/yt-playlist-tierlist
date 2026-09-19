import { fail, redirect } from '@sveltejs/kit';
import { DEFAULT_LANDING_PATH } from '$lib/auth/routes.js';
import { findInviteByToken, inviteProblem, redeemInvite } from '$lib/server/auth/invites.js';
import { passwordProblem } from '$lib/server/auth/password.js';
import { startSession } from '$lib/server/auth/sessions.js';
import {
	createUser,
	displayNameProblem,
	emailProblem,
	isDuplicateEmail,
	normalizeEmail
} from '$lib/server/auth/users.js';
import { serverConfig } from '$lib/server/config.js';
import { getDb } from '$lib/server/db/index.js';

/**
 * Is this link still good, and what does the form already know?
 *
 * The token is in the path rather than in a query string so that it is not repeated
 * in a `Referer` header when the page loads a stylesheet or an icon from elsewhere.
 * It is handed back to the form as a hidden field rather than re-read from the URL by
 * the action, which keeps the page the only thing that has to know where it lives.
 *
 * @type {import('./$types').PageServerLoad}
 */
export async function load({ params }) {
	const invite = await findInviteByToken(getDb(), params.token);
	const problem = inviteProblem(invite, Date.now());

	return {
		problem: problem?.message ?? null,
		// Pre-filled *and* pinned: an invite addressed to someone is not transferable
		// by editing a form field.
		email: problem ? null : (invite?.email ?? null)
	};
}

/** @satisfies {import('./$types').Actions} */
export const actions = {
	/**
	 * Redeem the invite: create the account and sign it in.
	 *
	 * The invite is re-checked here rather than trusted from the load — the load ran
	 * on a different request, and a link that was open in a tab for a week is exactly
	 * the case this page exists for.
	 *
	 * @type {import('./$types').Action}
	 */
	default: async (event) => {
		const data = await event.request.formData();
		const displayName = String(data.get('displayName') ?? '').trim();
		const password = String(data.get('password') ?? '');
		const submittedEmail = normalizeEmail(data.get('email'));

		const db = getDb();
		const invite = await findInviteByToken(db, event.params.token);
		const problem = inviteProblem(invite, Date.now());
		if (problem || !invite) {
			return fail(400, {
				displayName,
				message: problem?.message ?? 'This invite link is not valid. Ask for a new one.'
			});
		}

		// An invite that names an address wins over whatever the form posted.
		const email = invite.email ? normalizeEmail(invite.email) : submittedEmail;

		const fieldProblem =
			emailProblem(email) ?? displayNameProblem(displayName) ?? passwordProblem(password);
		if (fieldProblem) {
			return fail(400, { displayName, email, message: fieldProblem });
		}

		/** @type {string} */
		let userId;
		try {
			userId = await db.transaction(async (tx) => {
				const user = await createUser(tx, { email, displayName, password });

				// Conditional on the invite still being unused, so two posts of the same
				// link cannot both produce an account: the loser's insert is rolled back
				// with the transaction.
				const redeemed = await redeemInvite(tx, invite.id, user.id);
				if (!redeemed) tx.rollback();

				return user.id;
			});
		} catch (error) {
			if (isDuplicateEmail(error)) {
				return fail(400, {
					displayName,
					email,
					message: 'There is already an account with that email address. Sign in instead.'
				});
			}
			// `tx.rollback()` throws by design; anything else is a real failure and is
			// worth a log line, but both read the same to whoever is signing up.
			console.error('[invite] sign-up failed:', error);
			return fail(400, {
				displayName,
				email,
				message: 'This invite could not be redeemed. Ask for a new one.'
			});
		}

		await startSession(event, db, userId, { secure: serverConfig().isProduction });

		redirect(303, DEFAULT_LANDING_PATH);
	}
};
