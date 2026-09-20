import { describe, expect, it, vi } from 'vitest';
import {
	enterFullscreen,
	FULLSCREEN_EVENTS,
	fullscreenElementOf,
	isFullscreenElement,
	leaveFullscreen,
	lockLandscape,
	unlockOrientation
} from './fullscreen.js';

describe('fullscreenElementOf', () => {
	it('reads the standard property', () => {
		const node = {};
		expect(fullscreenElementOf({ fullscreenElement: node })).toBe(node);
	});

	it('falls back to the webkit spelling', () => {
		const node = {};
		expect(fullscreenElementOf({ webkitFullscreenElement: node })).toBe(node);
	});

	it('is null without a document and without a fullscreen element', () => {
		expect(fullscreenElementOf(null)).toBeNull();
		expect(fullscreenElementOf({})).toBeNull();
	});
});

describe('isFullscreenElement', () => {
	it('is true only for the element itself', () => {
		const wrapper = { contains: () => true };
		const iframe = {};

		expect(isFullscreenElement({ fullscreenElement: wrapper }, wrapper)).toBe(true);
		// The iframe inside our wrapper went fullscreen on its own: not ours.
		expect(isFullscreenElement({ fullscreenElement: iframe }, wrapper)).toBe(false);
	});

	it('is false when nothing is fullscreen or there is no element', () => {
		expect(isFullscreenElement({}, {})).toBe(false);
		expect(isFullscreenElement({ fullscreenElement: null }, null)).toBe(false);
	});
});

describe('enterFullscreen', () => {
	it('calls the standard request on the element', async () => {
		const requestFullscreen = vi.fn().mockResolvedValue(undefined);
		const element = { requestFullscreen };

		expect(await enterFullscreen(element)).toBe(true);
		expect(requestFullscreen).toHaveBeenCalledOnce();
		expect(requestFullscreen.mock.instances[0]).toBe(element);
	});

	it('accepts the webkit spelling', async () => {
		expect(await enterFullscreen({ webkitRequestFullscreen: async () => {} })).toBe(true);
	});

	it('reports a refusal instead of throwing', async () => {
		const element = { requestFullscreen: () => Promise.reject(new Error('no user gesture')) };
		expect(await enterFullscreen(element)).toBe(false);
	});

	it('reports browsers without element fullscreen (iOS Safari)', async () => {
		expect(await enterFullscreen({})).toBe(false);
		expect(await enterFullscreen(null)).toBe(false);
	});
});

describe('leaveFullscreen', () => {
	it('exits when something is fullscreen', async () => {
		const exitFullscreen = vi.fn().mockResolvedValue(undefined);
		expect(await leaveFullscreen({ fullscreenElement: {}, exitFullscreen })).toBe(true);
		expect(exitFullscreen).toHaveBeenCalledOnce();
	});

	it('does nothing when nothing is fullscreen', async () => {
		const exitFullscreen = vi.fn();
		expect(await leaveFullscreen({ exitFullscreen })).toBe(false);
		expect(exitFullscreen).not.toHaveBeenCalled();
	});

	it('swallows a refusal', async () => {
		const doc = {
			fullscreenElement: {},
			exitFullscreen: () => Promise.reject(new Error('nope'))
		};
		expect(await leaveFullscreen(doc)).toBe(false);
	});
});

describe('FULLSCREEN_EVENTS', () => {
	it('covers both spellings', () => {
		expect(FULLSCREEN_EVENTS).toEqual(['fullscreenchange', 'webkitfullscreenchange']);
	});
});

describe('lockLandscape', () => {
	it('asks the device for landscape', async () => {
		const lock = vi.fn().mockResolvedValue(undefined);
		const screen = { orientation: { lock } };

		expect(await lockLandscape(screen)).toBe(true);
		expect(lock).toHaveBeenCalledWith('landscape');
		expect(lock.mock.instances[0]).toBe(screen.orientation);
	});

	it('takes a refusal for an answer (every desktop browser)', async () => {
		const orientation = { lock: () => Promise.reject(new Error('not available on this device')) };
		expect(await lockLandscape({ orientation })).toBe(false);
	});

	it('survives a browser without the API (iOS Safari)', async () => {
		expect(await lockLandscape({ orientation: {} })).toBe(false);
		expect(await lockLandscape({})).toBe(false);
		expect(await lockLandscape(null)).toBe(false);
	});

	it('swallows a synchronous throw', async () => {
		const orientation = {
			lock: () => {
				throw new TypeError('not a function here either');
			}
		};
		expect(await lockLandscape({ orientation })).toBe(false);
	});
});

describe('unlockOrientation', () => {
	it('gives the rotation back', () => {
		const unlock = vi.fn();
		expect(unlockOrientation({ orientation: { unlock } })).toBe(true);
		expect(unlock).toHaveBeenCalledOnce();
	});

	it('is a no-op without the API, and never throws', () => {
		expect(unlockOrientation({ orientation: {} })).toBe(false);
		expect(unlockOrientation(null)).toBe(false);
		expect(
			unlockOrientation({
				orientation: {
					unlock: () => {
						throw new Error('nope');
					}
				}
			})
		).toBe(false);
	});
});
