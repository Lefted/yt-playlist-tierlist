import { describe, expect, it } from 'vitest';
import { importErrorMessage } from './errors.js';
import { ApiError } from '$lib/api.js';
import { API_ERROR_REASONS } from '$lib/youtube/api.js';

describe('importErrorMessage', () => {
	it('has its own message for every reason the server can answer with', () => {
		const messages = API_ERROR_REASONS.map((reason) =>
			importErrorMessage(new ApiError('raw server text', reason))
		);

		for (const message of messages) {
			expect(message).not.toBe('raw server text');
			expect(message.length).toBeGreaterThan(20);
		}
		expect(new Set(messages).size).toBe(API_ERROR_REASONS.length);
	});

	it('covers the client-side codes the API module invents', () => {
		// `offline` never comes from the server: `$lib/api.js` raises it when the
		// request did not get that far.
		expect(importErrorMessage(new ApiError('failed to fetch', 'offline'))).toMatch(/connection/i);
	});

	it('names the server’s key for an invalid one', () => {
		expect(importErrorMessage(new ApiError('403', 'keyInvalid'))).toMatch(/YOUTUBE_API_KEY/);
	});

	it('mentions the quota reset for a quota error', () => {
		expect(importErrorMessage(new ApiError('403', 'quotaExceeded'))).toMatch(/quota/i);
	});

	it('still understands a thrown YouTubeApiError-shaped reason', () => {
		const error = Object.assign(new Error('raw'), { reason: 'playlistNotFound' });
		expect(importErrorMessage(error)).toMatch(/No playlist found/);
	});

	it('falls back to the server’s own sentence for a code it does not know', () => {
		expect(importErrorMessage(new ApiError('That file is not valid JSON.', 'invalid_export'))).toBe(
			'That file is not valid JSON.'
		);
	});

	it('falls back to the message of a plain Error', () => {
		expect(importErrorMessage(new Error('Something else went wrong.'))).toBe(
			'Something else went wrong.'
		);
	});

	it('never returns an empty string', () => {
		expect(importErrorMessage(null)).not.toBe('');
		expect(importErrorMessage(undefined)).not.toBe('');
		expect(importErrorMessage('a string')).not.toBe('');
		expect(importErrorMessage(new Error(''))).not.toBe('');
	});
});
