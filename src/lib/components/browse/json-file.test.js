import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyLibraryFile, takeFile } from './json-file.js';
import { libraryPayload, makePlaylist, makeVideo, stubApi } from '$lib/testing/fixtures.js';
import { library } from '$lib/state/library.svelte.js';

vi.mock('$lib/notify.js', () => ({ notifyError: vi.fn() }));

/**
 * @param {string} text
 * @returns {File}
 */
function jsonFile(text) {
	return new File([text], 'library.json', { type: 'application/json' });
}

/**
 * @param {File[]} files
 * @returns {{ currentTarget: { files: File[], value: string } }}
 */
function changeEvent(files) {
	return { currentTarget: { files, value: 'C:\\fakepath\\library.json' } };
}

describe('takeFile', () => {
	it('returns the picked file', () => {
		const file = jsonFile('[]');
		expect(takeFile(/** @type {any} */ (changeEvent([file])))).toBe(file);
	});

	it('returns null when the dialog was cancelled', () => {
		expect(takeFile(/** @type {any} */ (changeEvent([])))).toBe(null);
	});

	it('clears the input so the same file can be picked again', () => {
		const event = changeEvent([jsonFile('[]')]);
		takeFile(/** @type {any} */ (event));
		expect(event.currentTarget.value).toBe('');
	});
});

describe('applyLibraryFile', () => {
	beforeEach(() => {
		library.clear();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/**
	 * @param {any} answer - What `POST /library/import-json` says.
	 * @returns {void}
	 */
	function stubImport(answer) {
		stubApi({ 'POST /library/import-json': answer });
	}

	it('sends the file and reports what the server merged', async () => {
		const stored = makePlaylist({
			id: 'PLexample',
			videos: [makeVideo({ id: 'aaaaaaaaaaa', rating: 'S' }), makeVideo({ id: 'bbbbbbbbbbb' })]
		});
		stubImport({
			summary: { playlists: 1, videos: 2, ratingsApplied: 1 },
			library: libraryPayload([stored])
		});

		const notice = await applyLibraryFile(
			jsonFile(JSON.stringify({ playlists: [{ id: 'PLexample', videos: [] }] }))
		);

		expect(notice.tone).toBe('ok');
		expect(notice.text).toContain('2 video(s)');
		expect(notice.text).toContain('1 playlist(s)');
		expect(notice.text).toContain('1 rating(s)');
		expect(library.playlists).toHaveLength(1);
	});

	it('reports a rejected file instead of throwing', async () => {
		stubImport({
			status: 400,
			body: { error: { code: 'invalid_export', message: 'That file is not valid JSON.' } }
		});

		const notice = await applyLibraryFile(jsonFile('not json at all'));

		expect(notice.tone).toBe('error');
		expect(notice.text).toBe('That file is not valid JSON.');
		expect(library.playlists).toHaveLength(0);
	});

	it('reports being offline instead of throwing', async () => {
		stubApi({
			'POST /library/import-json': () => {
				throw new TypeError('Failed to fetch');
			}
		});

		const notice = await applyLibraryFile(jsonFile('{"playlists":[]}'));

		expect(notice.tone).toBe('error');
		expect(notice.text).toMatch(/connection/i);
	});
});
