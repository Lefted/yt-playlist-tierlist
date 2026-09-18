import { describe, expect, it } from 'vitest';
import { playlistUrl, thumbnailFor } from './urls.js';
import { LEGACY_PLAYLIST_ID } from '../state/library.svelte.js';
import { makeVideo } from '../testing/fixtures.js';

describe('playlistUrl', () => {
	it('builds the youtube.com playlist URL', () => {
		expect(playlistUrl('PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')).toBe(
			'https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'
		);
	});

	it('accepts every playlist prefix YouTube hands out', () => {
		for (const prefix of ['PL', 'UU', 'FL', 'LL', 'RD', 'OL', 'TL', 'SP', 'PU', 'WL']) {
			expect(playlistUrl(`${prefix}abc_123-XYZ`)).toContain(`list=${prefix}abc_123-XYZ`);
		}
	});

	it('returns nothing for the local legacy-import collection', () => {
		// The card must not offer "Open in YouTube" for a playlist YouTube never had.
		expect(LEGACY_PLAYLIST_ID).toBe('legacy-import');
		expect(playlistUrl(LEGACY_PLAYLIST_ID)).toBe('');
	});

	it('returns nothing for anything that is not a playlist id', () => {
		expect(playlistUrl('')).toBe('');
		expect(playlistUrl('hello world')).toBe('');
		expect(playlistUrl('">bad')).toBe('');
		expect(playlistUrl(/** @type {any} */ (null))).toBe('');
	});
});

describe('thumbnailFor', () => {
	it('prefers the thumbnail the import stored', () => {
		const video = makeVideo({ id: 'dQw4w9WgXcQ', thumbnail: 'https://example.test/a.jpg' });
		expect(thumbnailFor(video)).toBe('https://example.test/a.jpg');
	});

	it('derives one from the video id when there is none', () => {
		const video = makeVideo({ id: 'dQw4w9WgXcQ', thumbnail: '' });
		expect(thumbnailFor(video)).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
	});

	it('gives up on an id that is not a video id', () => {
		expect(thumbnailFor(makeVideo({ id: 'playlist-item-id-that-is-long', thumbnail: '' }))).toBe(
			''
		);
	});
});
