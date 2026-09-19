import { describe, expect, it } from 'vitest';
import {
	IMPORT_ERROR_STATUS,
	importFailure,
	readActivePlaylistId,
	readImportInput,
	readOrder,
	readVideoPatch
} from './protocol.js';
import { API_ERROR_REASONS } from '../../youtube/api.js';
import { YouTubeApiError } from '../youtube.js';

describe('importFailure', () => {
	it('has a status for every reason the YouTube module can raise', () => {
		expect(Object.keys(IMPORT_ERROR_STATUS).sort()).toEqual([...API_ERROR_REASONS].sort());
	});

	it('keeps the reason as the code, which is what the browser renders', () => {
		expect(importFailure(new YouTubeApiError('Out of quota.', 'quotaExceeded'))).toEqual({
			status: 503,
			code: 'quotaExceeded',
			message: 'Out of quota.'
		});
	});

	it('is a 404 only for a playlist nobody can see', () => {
		const statuses = Object.entries(IMPORT_ERROR_STATUS).filter(([, status]) => status < 500);
		expect(statuses).toEqual([['playlistNotFound', 404]]);
	});

	it('blames nobody in particular for something it does not recognise', () => {
		expect(importFailure(new Error('boom'))).toEqual({
			status: 502,
			code: 'unknown',
			message: 'boom'
		});
		expect(importFailure(null).message).toBe('The import failed for an unknown reason.');
	});
});

describe('readImportInput', () => {
	it('takes a non-empty string', () => {
		expect(readImportInput({ input: '  PL1  ' })).toBe('  PL1  ');
	});

	it('refuses anything else', () => {
		expect(readImportInput({ input: '   ' })).toBeNull();
		expect(readImportInput({ input: 42 })).toBeNull();
		expect(readImportInput({})).toBeNull();
		expect(readImportInput(null)).toBeNull();
		expect(readImportInput('PL1')).toBeNull();
	});
});

describe('readActivePlaylistId', () => {
	it('tells "nothing active" apart from "no answer"', () => {
		expect(readActivePlaylistId({ playlistId: null })).toEqual({ playlistId: null });
		expect(readActivePlaylistId({ playlistId: 'PL1' })).toEqual({ playlistId: 'PL1' });
		expect(readActivePlaylistId({})).toBeNull();
		expect(readActivePlaylistId({ playlistId: '' })).toBeNull();
		expect(readActivePlaylistId({ playlistId: 7 })).toBeNull();
	});
});

describe('readVideoPatch', () => {
	it('carries only the keys the body mentioned', () => {
		expect(readVideoPatch({ rating: 'S' })).toEqual({ rating: 'S' });
		expect(readVideoPatch({ rating: null })).toEqual({ rating: null });
		expect(readVideoPatch({ unavailable: true })).toEqual({ unavailable: true });
		expect(readVideoPatch({ rating: 'F', unavailable: false })).toEqual({
			rating: 'F',
			unavailable: false
		});
	});

	it('refuses a rating that is not a tier, and a flag that is not a boolean', () => {
		expect(readVideoPatch({ rating: 'X' })).toBeNull();
		expect(readVideoPatch({ rating: 'unavailable' })).toBeNull();
		expect(readVideoPatch({ unavailable: 'yes' })).toBeNull();
		// One bad key spoils the request rather than being silently dropped.
		expect(readVideoPatch({ rating: 'S', unavailable: 1 })).toBeNull();
	});

	it('refuses a body that patches nothing', () => {
		expect(readVideoPatch({})).toBeNull();
		expect(readVideoPatch({ title: 'nice try' })).toBeNull();
		expect(readVideoPatch(null)).toBeNull();
	});
});

describe('readOrder', () => {
	it('takes an array of strings, empty included', () => {
		expect(readOrder({ order: [] })).toEqual([]);
		expect(readOrder({ order: ['v2', 'v1'] })).toEqual(['v2', 'v1']);
	});

	it('refuses anything else', () => {
		expect(readOrder({ order: 'v1' })).toBeNull();
		expect(readOrder({ order: ['v1', 2] })).toBeNull();
		expect(readOrder({})).toBeNull();
		expect(readOrder(null)).toBeNull();
	});
});
