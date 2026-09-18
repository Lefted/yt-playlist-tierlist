import { describe, expect, it } from 'vitest';
import { importErrorMessage } from './errors.js';
import { YouTubeApiError } from '$lib/youtube/api.js';

describe('importErrorMessage', () => {
	it('maps every reason the API module can produce to its own message', () => {
		/** @type {import('$lib/youtube/api.js').ApiErrorReason[]} */
		const reasons = ['keyInvalid', 'quotaExceeded', 'playlistNotFound', 'network', 'unknown'];
		const messages = reasons.map((reason) =>
			importErrorMessage(new YouTubeApiError('raw api text', reason))
		);

		for (const message of messages) {
			expect(message).not.toBe('raw api text');
			expect(message.length).toBeGreaterThan(20);
		}
		expect(new Set(messages).size).toBe(reasons.length);
	});

	it('names the API key for an invalid key', () => {
		expect(importErrorMessage(new YouTubeApiError('403', 'keyInvalid'))).toMatch(/API key/i);
	});

	it('mentions the quota reset for a quota error', () => {
		expect(importErrorMessage(new YouTubeApiError('403', 'quotaExceeded'))).toMatch(/quota/i);
	});

	it('falls back to the message of a plain Error, e.g. from a JSON import', () => {
		expect(importErrorMessage(new Error('That file is not valid JSON.'))).toBe(
			'That file is not valid JSON.'
		);
	});

	it('ignores a reason it does not know', () => {
		const error = Object.assign(new Error('custom text'), { reason: 'teapot' });
		expect(importErrorMessage(error)).toBe('custom text');
	});

	it('never returns an empty string', () => {
		expect(importErrorMessage(null)).not.toBe('');
		expect(importErrorMessage(undefined)).not.toBe('');
		expect(importErrorMessage('a string')).not.toBe('');
		expect(importErrorMessage(new Error(''))).not.toBe('');
	});
});
