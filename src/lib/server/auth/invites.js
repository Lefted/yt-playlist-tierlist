/**
 * Invites: the only way an account other than the bootstrap admin comes to exist.
 *
 * An admin creates one, copies the link out of `/admin` once, and sends it by
 * whatever channel they like — the app sends no mail (#16). The database keeps only
 * the token's hash, so the link cannot be recovered from `/admin` a second time; a
 * lost one is revoked and replaced.
 */

import { and, desc, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { createToken, hashToken } from './tokens.js';
import { invites, users } from '../db/schema.js';

/** @typedef {import('../db/index.js').DbHandle['db']} Db */
/** @typedef {import('drizzle-orm/pg-core').PgTransaction<any, any, any>} DbTransaction */

/** Default lifetime of an invite, from #16. */
export const INVITE_TTL_DAYS = 7;

/** The longest an admin may make one, so a link cannot be left lying around forever. */
export const MAX_INVITE_TTL_DAYS = 90;

/**
 * Why an invite cannot be redeemed, as a code plus a sentence.
 *
 * All three cases are told apart on purpose. Unlike a login, there is no account to
 * enumerate here — the recipient already holds a 256-bit secret — and "this link has
 * already been used" is the difference between someone re-opening their own mail and
 * someone needing a new invite.
 *
 * @typedef {{ code: 'invite_unknown' | 'invite_used' | 'invite_expired', message: string }} InviteProblem
 */

/**
 * Whether an invite row may still be redeemed.
 *
 * Pure, so the rule is testable without a database and is the same one `/admin` uses
 * to decide what is still "open".
 *
 * @param {{ usedAt: Date | null, expiresAt: Date } | null | undefined} invite
 * @param {number} now - Epoch milliseconds.
 * @returns {InviteProblem | null} `null` when it is good.
 */
export function inviteProblem(invite, now) {
	if (!invite) {
		return {
			code: 'invite_unknown',
			message: 'This invite link is not valid. Ask for a new one.'
		};
	}
	if (invite.usedAt) {
		return {
			code: 'invite_used',
			message: 'This invite has already been used. Ask for a new one.'
		};
	}
	if (invite.expiresAt.getTime() <= now) {
		return {
			code: 'invite_expired',
			message: 'This invite has expired. Ask for a new one.'
		};
	}
	return null;
}

/**
 * How many days an admin asked for, clamped to something sane.
 *
 * @param {unknown} value - Raw form field.
 * @returns {number}
 */
export function inviteTtlDays(value) {
	const days = Number(typeof value === 'string' ? value.trim() : value);
	if (!Number.isFinite(days) || days < 1) return INVITE_TTL_DAYS;
	return Math.min(Math.floor(days), MAX_INVITE_TTL_DAYS);
}

/**
 * Creates an invite and returns its token — the only time it exists in plain form.
 *
 * @param {Db} db
 * @param {object} input
 * @param {string} input.createdBy - Admin's user id.
 * @param {string | null} [input.email] - Pins the sign-up to this address when set.
 * @param {number} [input.ttlDays]
 * @param {number} [input.now] - Epoch milliseconds.
 * @returns {Promise<{ token: string, expiresAt: Date }>}
 */
export async function createInvite(
	db,
	{ createdBy, email = null, ttlDays = INVITE_TTL_DAYS, now = Date.now() }
) {
	const token = createToken();
	const expiresAt = new Date(now + ttlDays * 24 * 60 * 60 * 1000);

	await db.insert(invites).values({
		tokenHash: hashToken(token),
		createdBy,
		email,
		createdAt: new Date(now),
		expiresAt
	});

	return { token, expiresAt };
}

/**
 * The invite a link's token stands for, or `null`.
 *
 * @param {Db | DbTransaction} db
 * @param {string} token - Raw value out of the URL.
 * @returns {Promise<typeof invites.$inferSelect | null>}
 */
export async function findInviteByToken(db, token) {
	const [row] = await db
		.select()
		.from(invites)
		.where(eq(invites.tokenHash, hashToken(token)))
		.limit(1);
	return row ?? null;
}

/**
 * Marks an invite used, but only if it still is not.
 *
 * The `is null` in the `where` is the whole point: two sign-up posts from the same
 * link arriving together both pass {@link inviteProblem}, and exactly one of them
 * gets a row back from here. Called inside the sign-up transaction, so the loser's
 * account is rolled back rather than created for free.
 *
 * @param {Db | DbTransaction} db
 * @param {string} inviteId
 * @param {string} userId - The account that was just created.
 * @param {number} [now]
 * @returns {Promise<boolean>} Whether this caller was the one that redeemed it.
 */
export async function redeemInvite(db, inviteId, userId, now = Date.now()) {
	const rows = await db
		.update(invites)
		.set({ usedAt: new Date(now), usedBy: userId })
		.where(and(eq(invites.id, inviteId), isNull(invites.usedAt)))
		.returning({ id: invites.id });
	return rows.length > 0;
}

/**
 * Throws away an invite that has not been used. Revoking a used one would erase the
 * record of who joined how, so `/admin` only offers it for open ones.
 *
 * @param {Db} db
 * @param {string} inviteId
 * @returns {Promise<boolean>} Whether a row was removed.
 */
export async function revokeInvite(db, inviteId) {
	const rows = await db
		.delete(invites)
		.where(eq(invites.id, inviteId))
		.returning({ id: invites.id });
	return rows.length > 0;
}

/**
 * Every invite, newest first, with the name of the admin who made it and of whoever
 * redeemed it. The `/admin` table; never the token or its hash.
 *
 * @param {Db} db
 * @returns {Promise<Array<{
 *   id: string,
 *   email: string | null,
 *   createdAt: Date,
 *   expiresAt: Date,
 *   usedAt: Date | null,
 *   createdByName: string | null,
 *   usedByName: string | null
 * }>>}
 */
export function listInvites(db) {
	// `users` appears twice in this query, so at least one side needs a name of its
	// own — Postgres cannot tell the two `users` apart otherwise.
	const creator = alias(users, 'creator');
	const usedBy = alias(users, 'redeemer');

	return db
		.select({
			id: invites.id,
			email: invites.email,
			createdAt: invites.createdAt,
			expiresAt: invites.expiresAt,
			usedAt: invites.usedAt,
			createdByName: creator.displayName,
			usedByName: usedBy.displayName
		})
		.from(invites)
		.leftJoin(creator, eq(invites.createdBy, creator.id))
		.leftJoin(usedBy, eq(invites.usedBy, usedBy.id))
		.orderBy(desc(invites.createdAt));
}
