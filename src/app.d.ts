// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces

/// <reference types="vite-plugin-pwa/info" />
/// <reference types="vite-plugin-pwa/svelte" />

declare global {
	namespace App {
		// Filled in by the `handle` hook in `src/hooks.server.js` for every request, so
		// a server route never has to look at the cookie itself. `null` only on the
		// public routes — everything else is refused before it reaches a handler.
		interface Locals {
			user: import('$lib/server/auth/users.js').PublicUser | null;
			/** The session row behind the cookie; `id` is its SHA-256, never the token. */
			session: import('$lib/server/auth/sessions.js').SessionInfo | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
