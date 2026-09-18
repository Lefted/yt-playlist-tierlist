import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createLocalStorageStub,
	makePlaylist,
	makeVideo,
	storedLibrary
} from '../testing/fixtures.js';

/**
 * A playlist with one unrated, one S-rated, one unavailable and one F-rated video.
 * @returns {Record<string, string>}
 */
function seed() {
	return storedLibrary([
		makePlaylist({
			id: 'PL1',
			videos: [
				makeVideo({ id: 'v1', position: 0 }),
				makeVideo({ id: 'v2', position: 1, rating: 'S' }),
				makeVideo({ id: 'v3', position: 2, unavailable: true }),
				makeVideo({ id: 'v4', position: 3 }),
				makeVideo({ id: 'v5', position: 4, rating: 'F' })
			]
		})
	]);
}

/** @type {typeof import('./library.svelte.js').library} */
let library;
/** @type {typeof import('./session.svelte.js').session} */
let session;
/** @type {typeof import('./settings.svelte.js').settings} */
let settings;

/**
 * Fresh library + settings + session on top of the seeded storage.
 * @param {Record<string, string>} [initial]
 * @returns {Promise<void>}
 */
async function boot(initial = seed()) {
	vi.resetModules();
	vi.stubGlobal('localStorage', createLocalStorageStub(initial));
	({ library } = await import('./library.svelte.js'));
	({ settings } = await import('./settings.svelte.js'));
	({ session } = await import('./session.svelte.js'));
}

/** @returns {string[]} */
function queueIds() {
	return session.queue.map((video) => video.id);
}

beforeEach(async () => {
	await boot();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('queue', () => {
	it('holds the unrated, playable videos by default', () => {
		expect(queueIds()).toEqual(['v1', 'v4']);
		expect(session.currentVideo?.id).toBe('v1');
	});

	it('holds every playable video when rated ones are not skipped', () => {
		settings.skipRated = false;
		expect(queueIds()).toEqual(['v1', 'v2', 'v4', 'v5']);
	});

	it('never contains unavailable videos', () => {
		settings.skipRated = false;
		session.setFilter({ tiers: [], includeUnrated: true });
		expect(queueIds()).not.toContain('v3');

		library.markUnavailable('v1');
		expect(queueIds()).not.toContain('v1');
	});

	it('keeps unrated videos when a tier filter is set', () => {
		session.setFilter({ tiers: ['S'] });
		expect(queueIds()).toEqual(['v1', 'v2', 'v4']);
	});

	it('can restrict the queue to the selected tiers only', () => {
		session.setFilter({ tiers: ['S'], includeUnrated: false });
		expect(queueIds()).toEqual(['v2']);
	});

	it('ignores skipRated while a tier filter is active', () => {
		settings.skipRated = true;
		session.setFilter({ tiers: ['S', 'F'], includeUnrated: false });
		expect(queueIds()).toEqual(['v2', 'v5']);
	});

	it('exposes and replaces the filter', () => {
		session.setFilter({ tiers: ['S'] });
		expect([...session.filter.tiers]).toEqual(['S']);
		session.setFilter({ tiers: ['F', 'S'] });
		expect([...session.filter.tiers]).toEqual(['S', 'F']);
		session.setFilter({ tiers: ['F', 'nope'] });
		expect([...session.filter.tiers]).toEqual(['F']);

		session.includeUnrated = false;
		expect(session.filter.includeUnrated).toBe(false);

		session.clearFilter();
		expect([...session.filter.tiers]).toEqual([]);
		expect(session.filter.includeUnrated).toBe(true);
	});

	it('ignores values that are not tiers', () => {
		session.setFilter({ tiers: /** @type {any} */ (['S', 'nope']) });
		expect([...session.filter.tiers]).toEqual(['S']);
	});

	it('follows the playback order of the library', () => {
		library.shuffle(() => 0);
		expect(library.activeVideos.map((video) => video.id)).toEqual(['v2', 'v3', 'v4', 'v5', 'v1']);
		expect(queueIds()).toEqual(['v4', 'v1']);
	});

	it('is empty without an active playlist', async () => {
		await boot({});
		expect(session.queue).toEqual([]);
		expect(session.currentVideo).toBeNull();
		expect(session.hasNext).toBe(false);
		expect(session.hasPrevious).toBe(false);
	});
});

describe('navigation', () => {
	it('steps forwards and backwards inside the queue', () => {
		expect(session.hasPrevious).toBe(false);
		expect(session.previous()).toBe(false);

		expect(session.next()).toBe(true);
		expect(session.currentVideo?.id).toBe('v4');
		expect(session.next()).toBe(false);

		expect(session.previous()).toBe(true);
		expect(session.currentVideo?.id).toBe('v1');
	});

	it('jumps to a video of the queue', () => {
		expect(session.jumpTo('v4')).toBe(true);
		expect(session.index).toBe(1);
		expect(session.currentVideo?.id).toBe('v4');

		expect(session.jumpTo('v1')).toBe(true);
		expect(session.currentVideo?.id).toBe('v1');
	});

	it('pins a filtered-out video so a deep link still works', () => {
		// v2 is rated and skipRated is on, so it is not in the queue.
		expect(queueIds()).not.toContain('v2');
		expect(session.jumpTo('v2')).toBe(true);
		expect(session.currentVideo?.id).toBe('v2');
		expect(queueIds()).toEqual(['v1', 'v2', 'v4']);

		// Changing the filter drops the pin again.
		session.clearFilter();
		expect(queueIds()).toEqual(['v1', 'v4']);
	});

	it('refuses to jump to an unavailable or unknown video', () => {
		expect(session.jumpTo('v3')).toBe(false);
		expect(session.jumpTo('nope')).toBe(false);
		expect(session.currentVideo?.id).toBe('v1');
	});

	it('clamps the position when the queue shrinks', () => {
		settings.skipRated = false;
		session.jumpTo('v5');
		expect(session.index).toBe(3);

		settings.skipRated = true;
		expect(queueIds()).toEqual(['v1', 'v4']);
		expect(session.index).toBe(1);
		expect(session.currentVideo?.id).toBe('v4');
	});
});

describe('rateCurrent', () => {
	it('rates the current video and moves to the next one', () => {
		expect(session.rateCurrent('A')).toBe(true);
		expect(library.activeVideos[0].rating).toBe('A');
		// v1 left the queue, so the position stays and v4 moved in.
		expect(session.index).toBe(0);
		expect(session.currentVideo?.id).toBe('v4');
	});

	it('advances by one when the rated video stays in the queue', () => {
		settings.skipRated = false;
		expect(session.rateCurrent('A')).toBe(true);
		expect(session.index).toBe(1);
		expect(session.currentVideo?.id).toBe('v2');
	});

	it('stays put when auto-advance is off', () => {
		settings.autoAdvance = false;
		settings.skipRated = false;
		session.rateCurrent('A');
		expect(session.currentVideo?.id).toBe('v1');
		expect(session.index).toBe(0);
	});

	it('does nothing on an empty queue', async () => {
		await boot({});
		expect(session.rateCurrent('A')).toBe(false);
	});

	it('can clear a rating', () => {
		settings.skipRated = false;
		session.jumpTo('v2');
		session.rateCurrent(null);
		expect(library.activeVideos[1].rating).toBeNull();
	});
});

describe('advancePast', () => {
	it('moves on when the video left the queue', () => {
		// Rating v1 while `skipRated` is on drops it out; v4 slides into index 0.
		library.rate('v1', 'A');
		expect(session.advancePast('v1')).toBe(false);
		expect(session.currentVideo?.id).toBe('v4');
	});

	it('advances by one while the video is still in the queue', () => {
		settings.skipRated = false;
		expect(session.advancePast('v1')).toBe(true);
		expect(session.currentVideo?.id).toBe('v2');
	});

	it('does not move at the end of the queue', () => {
		settings.skipRated = false;
		session.jumpTo('v5');
		expect(session.advancePast('v5')).toBe(false);
		expect(session.currentVideo?.id).toBe('v5');
	});

	it('ignores a video the queue never had', () => {
		expect(session.advancePast('nope')).toBe(false);
		expect(session.currentVideo?.id).toBe('v1');
	});
});

describe('progress', () => {
	it('reports the rated share of the playable videos', () => {
		expect(session.progress).toEqual({ done: 2, total: 4 });

		session.rateCurrent('A');
		expect(session.progress).toEqual({ done: 3, total: 4 });
	});

	it('counts only what the filter covers', () => {
		// S-tier plus the unrated videos: v2, v1 and v4.
		session.setFilter({ tiers: ['S'] });
		expect(session.progress).toEqual({ done: 1, total: 3 });

		session.setFilter({ tiers: ['S'], includeUnrated: false });
		expect(session.progress).toEqual({ done: 1, total: 1 });
	});
});
