import { afterEach, describe, expect, it } from 'vitest';
import { network } from './network.svelte.js';

/**
 * A stand-in for `window` that lets a test flip `navigator.onLine` and fire the
 * corresponding event.
 */
function fakeWindow() {
	const bus = new EventTarget();
	return {
		navigator: { onLine: true },
		/**
		 * @param {string} type
		 * @param {() => void} listener
		 */
		addEventListener: (type, listener) => bus.addEventListener(type, listener),
		/**
		 * @param {string} type
		 * @param {() => void} listener
		 */
		removeEventListener: (type, listener) => bus.removeEventListener(type, listener),
		/** @param {boolean} online */
		goto(online) {
			this.navigator.onLine = online;
			bus.dispatchEvent(new Event(online ? 'online' : 'offline'));
		}
	};
}

/** @type {(() => void) | undefined} */
let stop;

afterEach(() => {
	stop?.();
	stop = undefined;
});

describe('network.watch', () => {
	it('adopts the current connectivity as soon as it is watched', () => {
		const target = fakeWindow();
		target.navigator.onLine = false;

		stop = network.watch(target);

		expect(network.online).toBe(false);
	});

	it('follows the online and offline events', () => {
		const target = fakeWindow();
		stop = network.watch(target);
		expect(network.online).toBe(true);

		target.goto(false);
		expect(network.online).toBe(false);

		target.goto(true);
		expect(network.online).toBe(true);
	});

	it('stops following once unsubscribed', () => {
		const target = fakeWindow();
		target.navigator.onLine = false;
		network.watch(target)();
		expect(network.online).toBe(false);

		target.goto(true);

		expect(network.online).toBe(false);
	});
});
