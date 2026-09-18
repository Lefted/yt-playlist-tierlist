import { useRegisterSW } from 'virtual:pwa-register/svelte';

/**
 * Service worker lifecycle as rune state.
 *
 * `virtual:pwa-register/svelte` reports its lifecycle through Svelte stores and
 * callbacks. This module is the only place that touches them, so the rest of the
 * app stays on runes.
 */
class ServiceWorkerStatus {
	#updateReady = $state(false);
	#offlineReady = $state(false);
	#registered = false;

	/** @returns {boolean} whether a newer version has taken over and wants a reload */
	get updateReady() {
		return this.#updateReady;
	}

	/** @returns {boolean} whether the app has just finished caching itself for offline use */
	get offlineReady() {
		return this.#offlineReady;
	}

	/**
	 * Registers the service worker. Idempotent, so it is safe to call from an
	 * `$effect` that may re-run.
	 */
	register() {
		if (this.#registered) return;
		this.#registered = true;

		useRegisterSW({
			// In `autoUpdate` mode the plugin reloads the page by itself the moment a
			// new worker activates. Claiming this hook turns that into a prompt, so an
			// update never interrupts a rating session mid-video.
			onNeedReload: () => {
				this.#updateReady = true;
			},
			onOfflineReady: () => {
				this.#offlineReady = true;
			}
		});
	}

	/**
	 * Loads the new version. The worker has already activated by this point, so
	 * there is nothing to skip-waiting — the page just has to come back up under it.
	 */
	applyUpdate() {
		this.#updateReady = false;
		location.reload();
	}

	/** Hides the prompt; the update still applies on the next natural page load. */
	dismiss() {
		this.#updateReady = false;
		this.#offlineReady = false;
	}
}

export const serviceWorker = new ServiceWorkerStatus();
