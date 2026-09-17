import { afterEach, describe, expect, it } from 'vitest';
import { currentVideo, isShowDummyVideo } from './Playlist.svelte.js';

afterEach(() => {
	delete currentVideo.id;
});

describe('isShowDummyVideo', () => {
	it('asks for the placeholder while no video is selected', () => {
		expect(isShowDummyVideo()).toBe(true);
	});

	it('asks for the player once a video is selected', () => {
		currentVideo.id = 'M7lc1UVf-VE';
		expect(isShowDummyVideo()).toBe(false);
	});
});
