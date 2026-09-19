/**
 * The server's environment, read once and validated up front.
 *
 * Every other server module takes its configuration from here instead of reaching
 * into `process.env`, so a missing or malformed variable is a loud failure at boot
 * (see `src/hooks.server.js`) rather than a 500 on some request hours later.
 *
 * `$env/dynamic/private` — not `$env/static/private` — because the image is built
 * once and run with whatever the cluster injects; nothing may be baked in at build
 * time.
 */

import { env } from '$env/dynamic/private';

/** Thrown when the environment cannot produce a usable {@link ServerConfig}. */
export class ConfigError extends Error {
	/** @param {string[]} problems - One sentence per offending variable. */
	constructor(problems) {
		super(`Invalid server environment:\n  - ${problems.join('\n  - ')}`);
		this.name = 'ConfigError';
		/** @type {string[]} */
		this.problems = problems;
	}
}

/**
 * @typedef {object} ServerConfig
 * @property {string} databaseUrl - postgres:// connection string.
 * @property {string | null} youtubeApiKey - Server-side key; required in production.
 * @property {string | null} origin - Public origin, e.g. `https://amv.lefted.dev`.
 * @property {string | null} adminEmail - Bootstrap admin, used by #16.
 * @property {string | null} adminPassword - Bootstrap admin password, used by #16.
 * @property {number} port - Port the node server listens on.
 * @property {string} gitSha - Commit the image was built from, or `unknown`.
 * @property {string} buildTime - ISO timestamp of the build, or `unknown`.
 * @property {string} nodeEnv - `production` in the container, `development` otherwise.
 * @property {boolean} isProduction - Shorthand for `nodeEnv === 'production'`.
 */

/**
 * A value that is present and not just whitespace, else `null`.
 *
 * Kubernetes Secrets and `.env` files both make it easy to end up with an empty
 * string where a variable was meant to be absent; the two mean the same here.
 *
 * @param {string | undefined} value
 * @returns {string | null}
 */
function clean(value) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

/**
 * Validates a raw environment and turns it into a {@link ServerConfig}.
 *
 * Pure on purpose: the tests drive it with plain objects, and the memoised
 * {@link serverConfig} is the only thing that knows about the real environment.
 * All problems are collected before throwing — fixing a deployment one missing
 * variable per restart is miserable.
 *
 * @param {Record<string, string | undefined>} source
 * @returns {ServerConfig}
 * @throws {ConfigError} If any variable is missing or malformed.
 */
export function readConfig(source) {
	/** @type {string[]} */
	const problems = [];

	const nodeEnv = clean(source.NODE_ENV) ?? 'development';
	const isProduction = nodeEnv === 'production';

	const databaseUrl = clean(source.DATABASE_URL);
	if (!databaseUrl) {
		problems.push('DATABASE_URL is required (e.g. postgres://amv:amv@localhost:5432/amv)');
	} else if (!isPostgresUrl(databaseUrl)) {
		problems.push('DATABASE_URL must be a postgres:// or postgresql:// URL');
	}

	const youtubeApiKey = clean(source.YOUTUBE_API_KEY);
	if (isProduction && !youtubeApiKey) {
		problems.push(
			'YOUTUBE_API_KEY is required in production (the server calls YouTube, not the browser)'
		);
	}

	const origin = clean(source.ORIGIN);
	if (origin && !isOrigin(origin)) {
		problems.push(
			'ORIGIN must be an absolute http(s) origin without a trailing path, e.g. https://amv.lefted.dev'
		);
	} else if (isProduction && !origin) {
		problems.push(
			'ORIGIN is required in production (e.g. https://amv.lefted.dev); adapter-node rejects form posts without it'
		);
	}

	// The pair bootstraps the first account on an empty users table (#16). Half of it
	// is always a mistake, and a silent one: no admin would be created.
	const adminEmail = clean(source.ADMIN_EMAIL);
	const adminPassword = clean(source.ADMIN_PASSWORD);
	if (Boolean(adminEmail) !== Boolean(adminPassword)) {
		problems.push('ADMIN_EMAIL and ADMIN_PASSWORD must be set together or not at all');
	}

	const rawPort = clean(source.PORT);
	const port = rawPort === null ? 3000 : Number(rawPort);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		problems.push(`PORT must be an integer between 1 and 65535 (got ${JSON.stringify(rawPort)})`);
	}

	if (problems.length > 0) throw new ConfigError(problems);

	return {
		databaseUrl: /** @type {string} */ (databaseUrl),
		youtubeApiKey,
		origin,
		adminEmail,
		adminPassword,
		port,
		// Provenance is injected by the container build; `unknown` keeps /api/v1/meta
		// answering when the app runs straight from a checkout instead of an image.
		gitSha: clean(source.GIT_SHA) ?? 'unknown',
		buildTime: clean(source.BUILD_TIME) ?? 'unknown',
		nodeEnv,
		isProduction
	};
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isPostgresUrl(value) {
	try {
		return ['postgres:', 'postgresql:'].includes(new URL(value).protocol);
	} catch {
		return false;
	}
}

/**
 * An origin is scheme + host + optional port and nothing else — `ORIGIN` is compared
 * against the request's origin byte for byte, so a trailing slash or a path silently
 * breaks every form post.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isOrigin(value) {
	try {
		const url = new URL(value);
		return ['http:', 'https:'].includes(url.protocol) && `${url.origin}` === value;
	} catch {
		return false;
	}
}

/** @type {ServerConfig | undefined} */
let cached;

/**
 * The validated environment of this process.
 *
 * Memoised, so the first caller (the `init` hook) decides whether the process may
 * live at all, and every caller after it is free.
 *
 * @returns {ServerConfig}
 * @throws {ConfigError}
 */
export function serverConfig() {
	return (cached ??= readConfig(env));
}
