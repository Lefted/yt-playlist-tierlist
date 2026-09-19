/**
 * Who is signed in, as far as the browser knows.
 *
 * The session itself lives in an HttpOnly cookie the client cannot read, so this
 * store is a mirror rather than a source of truth: the root layout load asks
 * `GET /api/v1/me` and pushes the answer in here, and everything that renders the
 * user (the header, the Admin link) reads it back out.
 *
 * Nothing here decides anything. Access is decided by `src/hooks.server.js`; a
 * client that lies to this store gets a prettier header and the same 401s.
 */

/** @typedef {import('$lib/server/auth/users.js').PublicUser} PublicUser */

/** Where the signed-in account is read from. */
export const ME_ENDPOINT = '/api/v1/me';

class AuthStore {
	/** @type {PublicUser | null} */
	#user = $state(null);

	/** @returns {PublicUser | null} The signed-in account, or `null`. */
	get user() {
		return this.#user;
	}

	/** @returns {boolean} Whether to offer the `/admin` link and page. */
	get isAdmin() {
		return this.#user?.role === 'admin';
	}

	/**
	 * @param {PublicUser | null} user
	 * @returns {void}
	 */
	set(user) {
		this.#user = user ?? null;
	}

	/**
	 * Reads `/api/v1/me` and stores the result.
	 *
	 * A 401 is the expected answer on `/login` and after a logout, so it is recorded
	 * as "nobody" rather than raised. So is a network failure: the app is a PWA and
	 * may well be opened offline, and an offline start should land on the login page,
	 * not on an error screen.
	 *
	 * @param {typeof globalThis.fetch} fetch - SvelteKit's `fetch` from the load.
	 * @returns {Promise<PublicUser | null>}
	 */
	async load(fetch) {
		try {
			const response = await fetch(ME_ENDPOINT, { headers: { accept: 'application/json' } });
			if (!response.ok) {
				this.set(null);
				return null;
			}
			const body = await response.json();
			this.set(body?.user ?? null);
		} catch {
			this.set(null);
		}
		return this.#user;
	}
}

export const auth = new AuthStore();
