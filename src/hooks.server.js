/**
 * Boot: validate the environment, then bring the database schema up to date.
 *
 * SvelteKit awaits `init` before the first request is served (adapter-node awaits it
 * before the socket is even opened), which makes it the right place for work that
 * must happen exactly once per process and must be finished before anyone is served.
 */

import { building, dev } from '$app/environment';
import { serverConfig } from '$lib/server/config.js';
import { applyMigrations, countShippedMigrations } from '$lib/server/db/migrations.js';

/** @type {import('@sveltejs/kit').ServerInit} */
export const init = async () => {
	// `vite build` loads the server bundle to analyse routes; there is no database
	// during a build, and there is nothing to migrate either.
	if (building) return;

	try {
		const config = serverConfig();
		await applyMigrations(config.databaseUrl);
		const version = await countShippedMigrations();
		console.log(
			`[boot] ${config.gitSha} (built ${config.buildTime}) ready at schema version ${version}`
		);
	} catch (error) {
		console.error('[boot] refusing to start:', error);

		// In production a half-migrated process must not serve: exiting non-zero leaves
		// the previous pods in place (`maxUnavailable: 0`) instead of rolling a broken
		// build over a working one. In dev, killing the Vite server would also kill the
		// watcher, so the error surfaces on the request instead and `npm run dev`
		// recovers as soon as the database or the `.env` is fixed.
		if (dev) throw error;
		process.exit(1);
	}
};
