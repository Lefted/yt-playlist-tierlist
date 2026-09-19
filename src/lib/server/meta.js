/**
 * The body of `GET /api/v1/meta`: which build is running, since when, and whether
 * its migrations actually reached the database.
 *
 * `dbSchemaVersion` (rows in `drizzle.__drizzle_migrations`) and
 * `binarySchemaVersion` (migration files shipped in this build) are the pair that
 * answers "did the rollout take?" — they agree on a healthy deployment, and a
 * mismatch tells the deploy runbook that an old pod is still serving or that a
 * migration was skipped.
 */

/**
 * @typedef {object} Meta
 * @property {string} commit - Git sha the image was built from, or `unknown`.
 * @property {string} buildTime - ISO timestamp of the build, or `unknown`.
 * @property {string} startedAt - ISO timestamp this process came up.
 * @property {number} dbSchemaVersion - Migrations recorded in the database.
 * @property {number} binarySchemaVersion - Migrations shipped with this build.
 */

/**
 * When this process came up.
 *
 * Read at import time, which for the node server is module load during boot — well
 * before the first request, and stable for the life of the process.
 */
export const STARTED_AT = new Date().toISOString();

/**
 * Builds the meta payload, defensively.
 *
 * The endpoint is the one place an operator looks when a deploy went sideways, so
 * it must never fail on its own inputs: blank provenance reads `unknown` and a
 * version that is not a count reads `0`, instead of `null`s in the JSON.
 *
 * @param {object} input
 * @param {string} [input.commit]
 * @param {string} [input.buildTime]
 * @param {string} [input.startedAt]
 * @param {number} [input.dbSchemaVersion]
 * @param {number} [input.binarySchemaVersion]
 * @returns {Meta}
 */
export function buildMeta({
	commit,
	buildTime,
	startedAt = STARTED_AT,
	dbSchemaVersion,
	binarySchemaVersion
}) {
	return {
		commit: text(commit),
		buildTime: text(buildTime),
		startedAt,
		dbSchemaVersion: count(dbSchemaVersion),
		binarySchemaVersion: count(binarySchemaVersion)
	};
}

/**
 * @param {string | undefined} value
 * @returns {string}
 */
function text(value) {
	const trimmed = typeof value === 'string' ? value.trim() : '';
	return trimmed === '' ? 'unknown' : trimmed;
}

/**
 * @param {number | undefined} value
 * @returns {number}
 */
function count(value) {
	return Number.isInteger(value) && /** @type {number} */ (value) >= 0
		? /** @type {number} */ (value)
		: 0;
}
