/**
 * Integration test for accounts, against a real Postgres.
 *
 * Runs only when `TEST_DATABASE_URL` points at a database it may **wipe** — see the
 * "Running the server" section of the README for the compose one-liner. Without it
 * the suite skips, so `npm test` stays a no-dependency command on any machine.
 *
 * What is worth a real database here is exactly what the unit tests cannot reach:
 * the unique index on `email`, the conditional update that redeems an invite, the
 * cascade that takes sessions with a user, and the join in `loadSession`.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	createInvite,
	findInviteByToken,
	inviteProblem,
	listInvites,
	redeemInvite,
	revokeInvite
} from './invites.js';
import { verifyPassword } from './password.js';
import {
	createSession,
	deleteSession,
	deleteSessionsOfUser,
	loadSession,
	SESSION_REFRESH_AFTER_MS,
	SESSION_TTL_MS
} from './sessions.js';
import { hashToken } from './tokens.js';
import {
	bootstrapAdmin,
	countActiveAdmins,
	countUsers,
	createUser,
	findUserByEmail,
	isDuplicateEmail,
	listUsers,
	setUserDisabled,
	setUserPassword
} from './users.js';
import { createDb } from '../db/index.js';
import { applyMigrations } from '../db/migrations.js';
import { claimTestDatabase, DB_LOCK_TIMEOUT_MS } from '../db/testing.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
	console.log(
		'[db] TEST_DATABASE_URL is not set — skipping the account integration tests. ' +
			'Start deploy/docker-compose.yml and set TEST_DATABASE_URL to run them.'
	);
}

const describeDb = databaseUrl ? describe : describe.skip;

describeDb('accounts against a real database', () => {
	/** A handle of its own, so nothing here touches the process-wide pool. */
	const { client, db } = createDb(databaseUrl ?? '', { max: 3 });

	/** @type {() => Promise<void>} */
	let release;

	/** Puts the database back to a freshly migrated, empty installation. */
	async function reset() {
		await client`drop table if exists invites, sessions, users, app_meta cascade`;
		await client`drop type if exists user_role cascade`;
		await client`drop schema if exists drizzle cascade`;
		await applyMigrations(/** @type {string} */ (databaseUrl));
	}

	/**
	 * @param {Partial<{ email: string, displayName: string, password: string, role: 'admin' | 'user' }>} [overrides]
	 * @returns {Promise<typeof import('../db/schema.js').users.$inferSelect>}
	 */
	function someone(overrides = {}) {
		return createUser(db, {
			email: 'moritz@example.com',
			displayName: 'Moritz',
			password: 'correct horse battery staple',
			...overrides
		});
	}

	// One suite at a time: every `*.db.test.js` file wipes this database, and Vitest
	// runs files in parallel. The generous timeout is the whole point — this hook is
	// *meant* to wait out the other suite, and Vitest's 10s default would call that
	// a failure.
	beforeAll(async () => {
		release = await claimTestDatabase(client);
	}, DB_LOCK_TIMEOUT_MS);

	beforeEach(reset);

	afterAll(async () => {
		await release();
		await client.end();
	});

	describe('the admin bootstrap', () => {
		it('creates the first admin on an empty table', async () => {
			const admin = await bootstrapAdmin(db, {
				email: ' Owner@Example.com ',
				password: 'a long enough password'
			});

			expect(admin).toMatchObject({ email: 'owner@example.com', role: 'admin' });
			expect(await countUsers(db)).toBe(1);

			const row = await findUserByEmail(db, 'owner@example.com');
			await expect(verifyPassword(row?.passwordHash ?? '', 'a long enough password')).resolves.toBe(
				true
			);
		});

		it('does nothing on the second boot', async () => {
			await bootstrapAdmin(db, { email: 'owner@example.com', password: 'a long enough password' });
			const again = await bootstrapAdmin(db, {
				email: 'owner@example.com',
				password: 'a different password'
			});

			expect(again).toBe(null);
			expect(await countUsers(db)).toBe(1);

			// The password an admin has since changed is not quietly restored.
			const row = await findUserByEmail(db, 'owner@example.com');
			await expect(verifyPassword(row?.passwordHash ?? '', 'a different password')).resolves.toBe(
				false
			);
		});

		it('ignores the variables once anybody has an account', async () => {
			await someone();

			expect(
				await bootstrapAdmin(db, { email: 'owner@example.com', password: 'a long enough password' })
			).toBe(null);
			expect(await countUsers(db)).toBe(1);
		});

		it('does nothing when the variables are not set', async () => {
			expect(await bootstrapAdmin(db, { email: null, password: null })).toBe(null);
			expect(await bootstrapAdmin(db, { email: 'owner@example.com', password: null })).toBe(null);
			expect(await countUsers(db)).toBe(0);
		});
	});

	describe('accounts', () => {
		it('cannot hold the same address twice, however it was typed', async () => {
			await someone({ email: 'moritz@example.com' });

			// The sign-up form turns exactly this into "that address already has an
			// account"; `isDuplicateEmail` is what reads it, through Drizzle's wrapper.
			await expect(someone({ email: 'Moritz@Example.COM' })).rejects.toSatisfy(isDuplicateEmail);
		});

		it('finds an account whatever case the address is asked in', async () => {
			await someone();

			expect(await findUserByEmail(db, '  MORITZ@example.com ')).toMatchObject({
				email: 'moritz@example.com'
			});
			expect(await findUserByEmail(db, 'someone.else@example.com')).toBe(null);
		});

		it('never stores the password itself', async () => {
			const user = await someone();

			expect(user.passwordHash).not.toContain('correct horse');
			expect(user.passwordHash).toMatch(/^\$argon2id\$/);
			await expect(verifyPassword(user.passwordHash, 'correct horse battery staple')).resolves.toBe(
				true
			);
		});

		it('replaces a password without touching anything else', async () => {
			const user = await someone();

			await setUserPassword(db, user.id, 'an entirely new password');

			const row = await findUserByEmail(db, user.email);
			await expect(
				verifyPassword(row?.passwordHash ?? '', 'an entirely new password')
			).resolves.toBe(true);
			await expect(
				verifyPassword(row?.passwordHash ?? '', 'correct horse battery staple')
			).resolves.toBe(false);
			expect(row?.displayName).toBe('Moritz');
		});

		it('counts the admins who could still sign in', async () => {
			const admin = await someone({ email: 'a@example.com', role: 'admin' });
			await someone({ email: 'b@example.com', role: 'admin' });
			await someone({ email: 'c@example.com' });

			expect(await countActiveAdmins(db)).toBe(2);

			await setUserDisabled(db, admin.id, true);

			expect(await countActiveAdmins(db)).toBe(1);
		});

		it('lists everyone, oldest first', async () => {
			await someone({ email: 'a@example.com' });
			await someone({ email: 'b@example.com', role: 'admin' });

			const rows = await listUsers(db);

			expect(rows.map((row) => row.email)).toEqual(['a@example.com', 'b@example.com']);
			expect(rows[0]).not.toHaveProperty('passwordHash');
		});
	});

	describe('sessions', () => {
		it('resolves a cookie token to its account', async () => {
			const user = await someone();
			const { token } = await createSession(db, { userId: user.id, userAgent: 'vitest' });

			const session = await loadSession(db, token);

			expect(session?.user).toEqual({
				id: user.id,
				email: 'moritz@example.com',
				displayName: 'Moritz',
				role: 'user'
			});
			expect(session?.sessionId).toBe(hashToken(token));
			expect(session?.refreshed).toBe(false);
		});

		it('stores the hash of the token, never the token', async () => {
			const user = await someone();
			const { token } = await createSession(db, { userId: user.id });

			const [row] = await client`select id from sessions`;

			expect(row.id).toBe(hashToken(token));
			expect(row.id).not.toBe(token);
		});

		it('says nothing for a token it has never seen', async () => {
			expect(await loadSession(db, 'not-a-real-token')).toBe(null);
		});

		it('deletes an expired session the moment it is presented', async () => {
			const user = await someone();
			const longAgo = Date.now() - SESSION_TTL_MS - 1000;
			const { token } = await createSession(db, { userId: user.id, now: longAgo });

			expect(await loadSession(db, token)).toBe(null);

			const rows = await client`select count(*)::int as count from sessions`;
			expect(rows[0].count).toBe(0);
		});

		it('slides the expiry once a day of use has passed, and not before', async () => {
			const user = await someone();
			const yesterday = Date.now() - SESSION_REFRESH_AFTER_MS - 1000;
			const { token, expiresAt } = await createSession(db, { userId: user.id, now: yesterday });

			const fresh = await loadSession(db, token);

			expect(fresh?.refreshed).toBe(true);
			expect(fresh?.expiresAt.getTime()).toBeGreaterThan(expiresAt.getTime());

			// Straight afterwards there is nothing to slide any more.
			expect((await loadSession(db, token))?.refreshed).toBe(false);
		});

		it("ends one browser's session without touching the others", async () => {
			const user = await someone();
			const one = await createSession(db, { userId: user.id });
			const two = await createSession(db, { userId: user.id });

			await deleteSession(db, hashToken(one.token));

			expect(await loadSession(db, one.token)).toBe(null);
			expect(await loadSession(db, two.token)).not.toBe(null);
		});

		it('refuses a disabled account and drops all of its sessions at once', async () => {
			const user = await someone();
			const one = await createSession(db, { userId: user.id });
			const two = await createSession(db, { userId: user.id });

			await setUserDisabled(db, user.id, true);

			expect(await loadSession(db, one.token)).toBe(null);
			expect(await loadSession(db, two.token)).toBe(null);

			const rows = await client`select count(*)::int as count from sessions`;
			expect(rows[0].count).toBe(0);
		});

		it('signs an account out everywhere, which is what disabling does', async () => {
			const user = await someone();
			await createSession(db, { userId: user.id });
			await createSession(db, { userId: user.id });

			await deleteSessionsOfUser(db, user.id);

			const rows = await client`select count(*)::int as count from sessions`;
			expect(rows[0].count).toBe(0);
		});
	});

	describe('invites', () => {
		it('round-trips a token and keeps only its hash', async () => {
			const admin = await someone({ role: 'admin' });
			const { token } = await createInvite(db, { createdBy: admin.id, email: 'new@example.com' });

			const invite = await findInviteByToken(db, token);

			expect(invite?.email).toBe('new@example.com');
			expect(invite?.tokenHash).toBe(hashToken(token));

			const [row] = await client`select token_hash from invites`;
			expect(row.token_hash).not.toBe(token);
		});

		it('is a week by default', async () => {
			const admin = await someone({ role: 'admin' });
			const now = Date.now();
			const { expiresAt } = await createInvite(db, { createdBy: admin.id, now });

			expect(expiresAt.getTime() - now).toBe(7 * 24 * 60 * 60 * 1000);
		});

		it('takes a sign-up through: account created, invite marked used', async () => {
			const admin = await someone({ email: 'admin@example.com', role: 'admin' });
			const { token } = await createInvite(db, { createdBy: admin.id, email: 'new@example.com' });

			const invite = await findInviteByToken(db, token);
			expect(inviteProblem(invite, Date.now())).toBe(null);

			const user = await db.transaction(async (tx) => {
				const created = await createUser(tx, {
					email: 'new@example.com',
					displayName: 'Newcomer',
					password: 'a long enough password'
				});
				expect(await redeemInvite(tx, /** @type {string} */ (invite?.id), created.id)).toBe(true);
				return created;
			});

			const redeemed = await findInviteByToken(db, token);
			expect(redeemed?.usedAt).toBeInstanceOf(Date);
			expect(redeemed?.usedBy).toBe(user.id);
			expect(inviteProblem(redeemed, Date.now())?.code).toBe('invite_used');
		});

		it('can only be redeemed once, even by two posts at the same time', async () => {
			const admin = await someone({ role: 'admin' });
			const { token } = await createInvite(db, { createdBy: admin.id });
			const invite = await findInviteByToken(db, token);
			const inviteId = /** @type {string} */ (invite?.id);

			const first = await someone({ email: 'first@example.com' });
			const second = await someone({ email: 'second@example.com' });

			expect(await redeemInvite(db, inviteId, first.id)).toBe(true);
			expect(await redeemInvite(db, inviteId, second.id)).toBe(false);

			expect((await findInviteByToken(db, token))?.usedBy).toBe(first.id);
		});

		it('rolls the account back when the invite was taken in the meantime', async () => {
			const admin = await someone({ role: 'admin' });
			const { token } = await createInvite(db, { createdBy: admin.id });
			const invite = await findInviteByToken(db, token);
			const inviteId = /** @type {string} */ (invite?.id);

			const winner = await someone({ email: 'winner@example.com' });
			await redeemInvite(db, inviteId, winner.id);

			await expect(
				db.transaction(async (tx) => {
					const loser = await createUser(tx, {
						email: 'loser@example.com',
						displayName: 'Loser',
						password: 'a long enough password'
					});
					if (!(await redeemInvite(tx, inviteId, loser.id))) tx.rollback();
				})
			).rejects.toThrow();

			expect(await findUserByEmail(db, 'loser@example.com')).toBe(null);
		});

		it('revokes an open invite and then has nothing left to revoke', async () => {
			const admin = await someone({ role: 'admin' });
			const { token } = await createInvite(db, { createdBy: admin.id });
			const invite = await findInviteByToken(db, token);
			const inviteId = /** @type {string} */ (invite?.id);

			expect(await revokeInvite(db, inviteId)).toBe(true);
			expect(await revokeInvite(db, inviteId)).toBe(false);
			expect(await findInviteByToken(db, token)).toBe(null);
		});

		it('lists invites newest first, with both names and never the hash', async () => {
			const admin = await someone({ email: 'admin@example.com', role: 'admin' });
			const newcomer = await someone({ email: 'new@example.com', displayName: 'Newcomer' });
			const older = await createInvite(db, { createdBy: admin.id, now: Date.now() - 60_000 });
			await createInvite(db, { createdBy: admin.id, email: 'later@example.com' });

			const olderRow = await findInviteByToken(db, older.token);
			await redeemInvite(db, /** @type {string} */ (olderRow?.id), newcomer.id);

			const rows = await listInvites(db);

			expect(rows).toHaveLength(2);
			expect(rows[0].email).toBe('later@example.com');
			expect(rows[0].createdByName).toBe('Moritz');
			expect(rows[1].usedByName).toBe('Newcomer');
			expect(rows[0]).not.toHaveProperty('tokenHash');
		});

		it('goes when the admin who made it goes', async () => {
			const admin = await someone({ role: 'admin' });
			const { token } = await createInvite(db, { createdBy: admin.id });

			await client`delete from users where id = ${admin.id}`;

			expect(await findInviteByToken(db, token)).toBe(null);
		});
	});
});
