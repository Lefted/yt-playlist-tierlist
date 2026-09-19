#!/usr/bin/env node
/**
 * set-password.js — give an account a new password.
 *
 *   npm run user:set-password -- someone@example.com
 *
 * This is the whole of password recovery (#16 rules out reset by email), so it is
 * meant to be run by whoever has a shell on the box the app runs on — locally
 * against `.env`, or in the cluster with
 * `kubectl -n amv exec deploy/amv-tierlist -- node scripts/set-password.js …`.
 *
 * It runs outside Vite, so it reaches the app's modules by relative path and reads
 * `.env` through Node's own loader rather than through `$env`.
 */

import { createInterface } from 'node:readline/promises';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '../src/lib/server/auth/password.js';
import { deleteSessionsOfUser } from '../src/lib/server/auth/sessions.js';
import { findUserByEmail, setUserPassword } from '../src/lib/server/auth/users.js';
import * as schema from '../src/lib/server/db/schema.js';

try {
	process.loadEnvFile('.env');
} catch {
	// No .env here — use whatever is already in the environment (container, cluster).
}

/**
 * @param {string} message
 * @returns {never}
 */
function die(message) {
	console.error(`error: ${message}`);
	process.exit(1);
}

/**
 * Whether there is a human at a terminal.
 *
 * It decides how stdin is read at all, not just whether the echo can be hidden: a
 * `readline` interface over a pipe closes itself at end-of-stream, which makes the
 * second of two prompts throw rather than see the second line that is already there.
 */
const interactive = Boolean(process.stdin.isTTY);

/** The lines of a piped stdin, read once, handed out one prompt at a time. */
let pipedLines = /** @type {string[] | null} */ (null);

/**
 * Reads a line without echoing it, so the password does not end up on the screen or
 * in a scrollback buffer.
 *
 * Piped input (CI, `printf … | npm run user:set-password`) is read straight off the
 * stream instead: there is no terminal to hide it from, and no prompt worth writing.
 *
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function askSecret(prompt) {
	if (!interactive) {
		if (pipedLines === null) {
			/** @type {Buffer[]} */
			const chunks = [];
			for await (const chunk of process.stdin) chunks.push(chunk);
			pipedLines = Buffer.concat(chunks).toString('utf8').split(/\r?\n/);
		}
		return pipedLines.shift() ?? '';
	}

	const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

	// `_writeToOutput` is readline's own hook for this; there is no public API.
	// Everything but the prompt itself is swallowed.
	// @ts-expect-error - internal, and the only way to mute an echo.
	rl._writeToOutput = (/** @type {string} */ chunk) => {
		if (chunk.includes(prompt)) process.stdout.write(prompt);
	};

	try {
		const answer = await rl.question(prompt);
		process.stdout.write('\n');
		return answer;
	} finally {
		rl.close();
	}
}

const email = process.argv[2];
if (!email) {
	die('usage: npm run user:set-password -- <email>');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	die('DATABASE_URL is not set (copy .env.example to .env, or export it)');
}

const client = postgres(/** @type {string} */ (databaseUrl), { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });

try {
	const user = await findUserByEmail(db, /** @type {string} */ (email));
	if (!user) die(`no account with the email ${email}`);

	const password = await askSecret(`New password for ${user.email} (min ${MIN_PASSWORD_LENGTH}): `);
	const problem = passwordProblem(password);
	if (problem) die(problem);

	const again = await askSecret('Repeat it: ');
	if (again !== password) die('the two passwords do not match');

	await setUserPassword(db, user.id, password);

	// A password change is also the answer to "somebody else has my session": every
	// browser that was signed in as this account has to sign in again.
	await deleteSessionsOfUser(db, user.id);

	console.log(`Password updated for ${user.email}; all of their sessions were signed out.`);
} finally {
	await client.end();
}
