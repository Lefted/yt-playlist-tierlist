/**
 * Reactive connectivity state for the app shell.
 *
 * The shell and the imported library work offline; only the YouTube player and a
 * playlist import need the network. The header uses this to tell the user why
 * playback suddenly stopped working.
 */

/**
 * The slice of `window` this module needs. Keeping it as an explicit parameter
 * makes the watcher testable without a DOM.
 *
 * @typedef {{
 *   navigator: { onLine: boolean };
 *   addEventListener: (type: string, listener: () => void) => void;
 *   removeEventListener: (type: string, listener: () => void) => void;
 * }} NetworkTarget
 */

class NetworkStatus {
	/**
	 * Assume connectivity until the browser tells us otherwise: a false "offline"
	 * banner during startup is worse than a late one.
	 */
	#online = $state(true);

	/** @returns {boolean} whether the browser currently reports a connection */
	get online() {
		return this.#online;
	}

	/**
	 * Mirrors `navigator.onLine` into this store until the returned function is
	 * called. Meant to be used from an `$effect`, whose teardown unsubscribes.
	 *
	 * @param {NetworkTarget} target usually `window`
	 * @returns {() => void} unsubscribe
	 */
	watch(target) {
		const sync = () => {
			this.#online = target.navigator.onLine;
		};

		sync();
		target.addEventListener('online', sync);
		target.addEventListener('offline', sync);

		return () => {
			target.removeEventListener('online', sync);
			target.removeEventListener('offline', sync);
		};
	}
}

export const network = new NetworkStatus();
