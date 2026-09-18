import { beforeEach, describe, expect, it } from 'vitest';
import { applyLibraryFile, takeFile } from './json-file.js';
import { library } from '$lib/state/library.svelte.js';

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

	it('imports an exported library and reports what landed', async () => {
		const playlist = {
			id: 'PLexample',
			title: 'Example',
			videos: [
				{ id: 'aaaaaaaaaaa', title: 'One', rating: 'S' },
				{ id: 'bbbbbbbbbbb', title: 'Two', rating: null }
			]
		};
		const notice = await applyLibraryFile(jsonFile(JSON.stringify({ playlists: [playlist] })));

		expect(notice.tone).toBe('ok');
		expect(notice.text).toContain('2 video(s)');
		expect(notice.text).toContain('1 playlist(s)');
		expect(notice.text).toContain('1 rating(s)');
		expect(library.playlists).toHaveLength(1);
	});

	it('reports invalid JSON instead of throwing', async () => {
		const notice = await applyLibraryFile(jsonFile('not json at all'));

		expect(notice.tone).toBe('error');
		expect(notice.text).toBe('That file is not valid JSON.');
		expect(library.playlists).toHaveLength(0);
	});

	it('reports an unrecognised shape instead of throwing', async () => {
		const notice = await applyLibraryFile(jsonFile('{"nope":true}'));

		expect(notice.tone).toBe('error');
		expect(notice.text).toContain('Unrecognised export');
	});
});
