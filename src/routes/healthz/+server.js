import { json } from '$lib/server/http.js';

/**
 * Liveness probe.
 *
 * Deliberately knows nothing about the database: it answers "this process is up and
 * serving". A probe that fails when Postgres hiccups would have Kubernetes restart
 * perfectly healthy pods and turn a database blip into an outage. Whether the
 * database is reachable is what `/api/v1/meta` is for.
 *
 * @type {import('./$types').RequestHandler}
 */
export function GET() {
	return json({ ok: true });
}
