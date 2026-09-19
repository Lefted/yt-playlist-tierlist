// Configuration for the `drizzle-kit` CLI (`npm run db:generate` / `db:migrate` /
// `db:studio`). The app itself never reads this file — it applies the generated
// migrations at boot through `src/lib/server/db/migrations.js`.

import { defineConfig } from 'drizzle-kit';

// The CLI runs outside Vite, so nothing has loaded `.env` for it. Node's own loader
// keeps that dependency-free; an absent file is normal (CI and the container pass
// the variables in the environment).
try {
	process.loadEnvFile('.env');
} catch {
	// no .env here — use whatever is already in the environment
}

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/lib/server/db/schema.js',
	out: './drizzle',
	dbCredentials: {
		// `generate` never connects, so an empty string is fine there; `migrate` and
		// `studio` fail with drizzle-kit's own message when it is not set.
		url: process.env.DATABASE_URL ?? ''
	},
	strict: true,
	verbose: true
});
