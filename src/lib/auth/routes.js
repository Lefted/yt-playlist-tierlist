/**
 * Which URLs need an account, and where an unauthenticated visitor is sent.
 *
 * Deliberately **not** under `src/lib/server/`: the same rules have to hold in two
 * places. `src/hooks.server.js` applies them to every request that reaches the node
 * server, and `src/routes/+layout.js` applies them again in the browser, because
 * with `ssr = false` a page navigation inside the SPA never touches the server at
 * all. Two copies of this list would drift, and the drift would be a hole.
 *
 * Everything here is a pure string function so the rules can be tested without a
 * request, a database or a browser.
 */

/** Where an unauthenticated visitor is sent, and where a session begins. */
export const LOGIN_PATH = '/login';

/** Where a signed-in visitor lands when nothing better is known. */
export const DEFAULT_LANDING_PATH = '/browse';

/**
 * Reachable without a session.
 *
 * `/healthz` and `/api/v1/meta` are the probes from #14's contract — kubelet has no
 * cookie and must still get an answer. The other two are how an account comes into
 * existence in the first place.
 */
const PUBLIC_EXACT = new Set(['/healthz', '/api/v1/meta']);

/** Public together with everything below them (`/invite/<token>`, …). */
const PUBLIC_PREFIXES = ['/login', '/invite'];

/**
 * The client bundle. Served by adapter-node's static middleware ahead of the hooks
 * in production, but `vite dev` and `vite preview` route differently, so the rule
 * is stated rather than assumed.
 */
const APP_PREFIX = '/_app/';

/**
 * Whether a path may be served without a session.
 *
 * @param {string} pathname - `event.url.pathname`; SvelteKit has already stripped
 *   any `/__data.json` suffix, so this is always a route path or an asset path.
 * @returns {boolean}
 */
export function isPublicPath(pathname) {
	if (PUBLIC_EXACT.has(pathname)) return true;
	if (pathname.startsWith(APP_PREFIX)) return true;
	if (isAtOrBelow(PUBLIC_PREFIXES, pathname)) return true;
	return isStaticAsset(pathname);
}

/**
 * Whether `pathname` is one of `prefixes` or lives under it.
 *
 * The `/`-or-end is the whole point: `startsWith('/login')` alone would also match
 * `/logins`, and a route-prefix test that answers yes to a route nobody wrote is
 * how a gate acquires a hole.
 *
 * @param {string[]} prefixes
 * @param {string} pathname
 * @returns {boolean}
 */
function isAtOrBelow(prefixes, pathname) {
	return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Whether a path is a file out of `static/` — the icons, `favicon.png`, and the PWA's
 * `sw.js`, `workbox-*.js` and `manifest.webmanifest`.
 *
 * Recognised by shape: a single path segment that carries an extension. Every route
 * of this app is extension-free, and everything the build emits at the site root is
 * not, so the two sets cannot overlap. Nested paths are excluded on purpose — a
 * heuristic that let `/admin/x.js` through would be a hole rather than a shortcut.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
function isStaticAsset(pathname) {
	const segments = pathname.split('/');
	return segments.length === 2 && segments[1].includes('.');
}

/**
 * The pages that stand outside the app: signing in, signing up, signing out.
 *
 * Exported because `vite.config.js` builds the service worker's
 * `navigateFallbackDenylist` from it — the precached shell is one file for
 * everybody, and these are exactly the URLs whose answer depends on who is asking.
 * Two hand-kept lists of that fact would drift, and the drift would show up as a
 * cached login page or a swallowed invite token.
 *
 * Not the same list as {@link PUBLIC_PREFIXES}, deliberately: `/logout` needs a
 * session (you cannot log out of nothing) but has no business showing a nav bar.
 */
export const SHELL_FREE_PREFIXES = ['/login', '/logout', '/invite'];

/**
 * Whether a page should be rendered without the app shell.
 *
 * The header and the bottom tab bar are navigation between places you need an
 * account to be; offering them to somebody who has not signed in yet is a row of
 * links that all bounce back to the form they are already looking at.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isShellFreePath(pathname) {
	return isAtOrBelow(SHELL_FREE_PREFIXES, pathname);
}

/**
 * Whether a path is served as JSON rather than as the app shell.
 *
 * It decides how a missing session is reported: a page navigation is redirected to
 * the login form, an API call gets 401 in the shared error envelope — redirecting
 * `fetch` to an HTML page would surface as a JSON parse error instead.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isApiPath(pathname) {
	return pathname === '/api' || pathname.startsWith('/api/');
}

/**
 * The login URL that comes back to `target` afterwards.
 *
 * @param {string} [target] - Path (with query) the visitor was trying to reach.
 * @returns {string}
 */
export function loginPathFor(target) {
	const safe = target === undefined ? null : safeRedirect(target, null);
	if (!safe || safe === DEFAULT_LANDING_PATH) return LOGIN_PATH;
	return `${LOGIN_PATH}?redirectTo=${encodeURIComponent(safe)}`;
}

/**
 * A `redirectTo` value that can be followed, or the fallback.
 *
 * `redirectTo` arrives in a query string, which means it is attacker-controlled: the
 * classic phishing move is a login link that sends you somewhere else entirely once
 * you have typed your password. Only a path on this origin survives — no scheme, no
 * host, and not the protocol-relative `//evil.example` or its backslash variants,
 * which some URL parsers read as a host.
 *
 * Pointing back at the login flow is refused too: it is never what the visitor
 * wanted and it is how a redirect loop starts.
 *
 * @template {string | null} F
 * @param {unknown} target - Raw value from the query string or a form field.
 * @param {F} [fallback] - Returned when `target` cannot be trusted.
 * @returns {string | F}
 */
export function safeRedirect(target, fallback = /** @type {F} */ (DEFAULT_LANDING_PATH)) {
	if (typeof target !== 'string' || !target.startsWith('/')) return fallback;
	// `//host`, `/\host` and `/\\host` are all read as "another origin" somewhere.
	if (/^\/[/\\]/.test(target)) return fallback;
	// A control character can smuggle a newline into a `Location` header.
	// eslint-disable-next-line no-control-regex
	if (/[\u0000-\u001f\u007f]/.test(target)) return fallback;

	const [pathname] = target.split(/[?#]/, 1);
	if (pathname === LOGIN_PATH || pathname === '/logout') return fallback;
	if (pathname.startsWith('/invite')) return fallback;

	return target;
}
