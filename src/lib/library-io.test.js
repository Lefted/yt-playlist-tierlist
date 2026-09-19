import { describe, expect, it } from 'vitest';
import {
	applyImport,
	ImportFormatError,
	LEGACY_PLAYLIST_ID,
	parseImport,
	serializeExport
} from './library-io.js';
import { makePlaylist, makeVideo } from './testing/fixtures.js';

const NOW = '2026-09-19T12:00:00.000Z';

/**
 * @param {string} text
 * @param {import('./types.js').Playlist[]} [existing]
 * @returns {import('./library-io.js').AppliedImport}
 */
function importInto(text, existing = []) {
	return applyImport(existing, parseImport(text), NOW);
}

describe('serializeExport', () => {
	it('writes the versioned, pretty-printed payload', () => {
		const text = serializeExport(
			[makePlaylist({ id: 'PL1', videos: [makeVideo({ id: 'v1' })] })],
			NOW
		);

		expect(text).toContain('\n  "version": 1');
		expect(JSON.parse(text)).toMatchObject({
			version: 1,
			exportedAt: NOW,
			playlists: [{ id: 'PL1' }]
		});
	});

	it('round-trips through parseImport', () => {
		const playlists = [
			makePlaylist({
				id: 'PL1',
				videos: [makeVideo({ id: 'v1', rating: 'A' }), makeVideo({ id: 'v2', position: 1 })]
			})
		];
		const parsed = parseImport(serializeExport(playlists, NOW));

		expect(parsed.kind).toBe('library');
		expect(parsed.kind === 'library' && parsed.playlists).toEqual(playlists);
	});
});

describe('parseImport', () => {
	it('rejects invalid JSON and unknown shapes, with a sentence each', () => {
		expect(() => parseImport('{not json')).toThrow(ImportFormatError);
		expect(() => parseImport('{not json')).toThrow(/valid JSON/);
		expect(() => parseImport('{"foo": 1}')).toThrow(/Unrecognised export/);
		expect(() => parseImport('{"playlists": [{"title": "no id"}]}')).toThrow(/Unrecognised export/);
		expect(() => parseImport('[]')).toThrow(/Unrecognised export/);
		expect(() => parseImport('[{"title": "no id"}]')).toThrow(/Unrecognised export/);
	});

	it('takes an already-parsed body, which is what a request hands over', () => {
		const parsed = parseImport({ playlists: [{ id: 'PL1', videos: [{ id: 'v1' }] }] });
		expect(parsed.kind === 'library' && parsed.playlists[0].id).toBe('PL1');
	});
});

describe('applyImport, current format', () => {
	it('merges into an empty library and counts what landed', () => {
		const { playlists, summary, changed } = importInto(
			JSON.stringify({
				version: 1,
				playlists: [
					{
						id: 'PL1',
						videos: [{ id: 'v1', rating: 'A' }, { id: 'v2' }]
					}
				]
			})
		);

		expect(summary).toEqual({ playlists: 1, videos: 2, ratingsApplied: 1 });
		expect(changed.map((playlist) => playlist.id)).toEqual(['PL1']);
		expect(playlists[0].videos.map((video) => video.rating)).toEqual(['A', null]);
	});

	it('never overwrites a rating that is already there', () => {
		const existing = [makePlaylist({ id: 'PL1', videos: [makeVideo({ id: 'v1', rating: 'S' })] })];
		const { playlists, summary } = importInto(
			JSON.stringify({
				playlists: [{ id: 'PL1', videos: [{ id: 'v1', rating: 'F' }, { id: 'v2' }] }]
			}),
			existing
		);

		expect(playlists[0].videos.map((video) => video.id)).toEqual(['v1', 'v2']);
		expect(playlists[0].videos[0].rating).toBe('S');
		expect(summary.ratingsApplied).toBe(0);
	});

	it('does not retire videos a restored backup predates', () => {
		const existing = [
			makePlaylist({
				id: 'PL1',
				videos: [makeVideo({ id: 'v1', rating: 'S' }), makeVideo({ id: 'v2', position: 1 })]
			})
		];
		// An older export that only knew about v1.
		const { playlists } = importInto(
			JSON.stringify({ playlists: [{ id: 'PL1', videos: [{ id: 'v1' }] }] }),
			existing
		);

		expect(playlists[0].videos.map((video) => video.unavailable)).toEqual([false, false]);
	});

	it('leaves the library it was given alone', () => {
		const existing = [makePlaylist({ id: 'PL1', videos: [makeVideo({ id: 'v1' })] })];
		const before = JSON.stringify(existing);

		importInto(
			JSON.stringify({ playlists: [{ id: 'PL1', videos: [{ id: 'v1', rating: 'B' }] }] }),
			existing
		);

		expect(JSON.stringify(existing)).toBe(before);
	});
});

describe('applyImport, legacy format', () => {
	/** @returns {import('./types.js').Playlist[]} */
	function seeded() {
		return [
			makePlaylist({
				id: 'PL1',
				videos: [
					makeVideo({ id: 'v1', position: 0 }),
					makeVideo({ id: 'v2', position: 1 }),
					makeVideo({ id: 'v3', position: 2, rating: 'S' })
				]
			})
		];
	}

	it('applies ratings to matching videos and collects the rest', () => {
		const { playlists, summary, changed } = importInto(
			JSON.stringify([
				{ videoId: 'v1', title: 'one', rating: 'A' },
				{ videoId: 'v2', title: 'two', rating: 'unavailable' },
				{ videoId: 'v3', title: 'three', rating: 'F' },
				{ videoId: 'v9', title: 'nine', rating: 'B' }
			]),
			seeded()
		);

		const playlist = /** @type {any} */ (playlists.find((entry) => entry.id === 'PL1'));
		expect(playlist.videos[0].rating).toBe('A');
		expect(playlist.videos[1]).toMatchObject({ rating: null, unavailable: true });
		// A local rating is never overwritten by an import.
		expect(playlist.videos[2].rating).toBe('S');

		const legacy = /** @type {any} */ (playlists.find((entry) => entry.id === LEGACY_PLAYLIST_ID));
		expect(legacy.videos).toHaveLength(1);
		expect(legacy.videos[0]).toMatchObject({ id: 'v9', title: 'nine', rating: 'B' });

		expect(summary).toEqual({ playlists: 2, videos: 4, ratingsApplied: 2 });
		expect(changed.map((playlist) => playlist.id)).toEqual(['PL1', LEGACY_PLAYLIST_ID]);
	});

	it('touches nothing it does not match', () => {
		const existing = seeded();
		const before = JSON.stringify(existing);

		const { changed, summary } = importInto(
			JSON.stringify([{ videoId: 'v9', rating: 'B' }]),
			existing
		);

		expect(JSON.stringify(existing)).toBe(before);
		expect(changed.map((playlist) => playlist.id)).toEqual([LEGACY_PLAYLIST_ID]);
		expect(summary.playlists).toBe(1);
	});
});
