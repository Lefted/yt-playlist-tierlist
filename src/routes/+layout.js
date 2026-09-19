import { redirect } from '@sveltejs/kit';
import { isPublicPath, LOGIN_PATH, loginPathFor, safeRedirect } from '$lib/auth/routes.js';
import { auth } from '$lib/state/auth.svelte.js';
import { library } from '$lib/state/library.svelte.js';

// Every page is rendered in the browser. The node server sends the same empty shell
// for every route and the client router takes it from there — the state runes reach
// for `localStorage`, which does not exist on the server.
export const ssr = false;
export const prerender = false;

/**
 * Who is signed in, and may they be here?
 *
 * `src/hooks.server.js` already answers that for anything that reaches the server —
 * but with `ssr = false` most navigations never do: the shell is loaded once and the
 * client router takes over. So the gate is stated twice, and this half also exists to
 * *fetch the user*, which the server-rendered page cannot hand over when there is no
 * server-rendered page.
 *
 * It runs on startup and again after every `invalidateAll()`, which is what logging
 * in and out trigger — so one `/api/v1/me` per session change, not per navigation.
 *
 * @type {import('./$types').LayoutLoad}
 */
export async function load({ fetch, url }) {
	const user = await auth.load(fetch);
	const target = url.pathname + url.search;

	if (!user) {
		// Whoever was here is gone; leaving their playlists in memory would show them
		// to the next person to sign in on this device, at least until the read lands.
		library.clear();
		if (!isPublicPath(url.pathname)) redirect(307, loginPathFor(target));
		return { user: null };
	}

	// Deliberately not awaited: the library is the page's content, not its gate, and
	// `library.loading` is what Browse and Rate render while it is on its way. It
	// never rejects — a failed read becomes `library.error`.
	library.ensureLoaded(user.id);

	// Someone who is already signed in has no business on the login form; without
	// this, a bookmarked `/login` looks like a logged-out app.
	if (url.pathname === LOGIN_PATH) redirect(307, safeRedirect(url.searchParams.get('redirectTo')));

	return { user };
}
