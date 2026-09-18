import { describe, expect, it } from 'vitest';
import {
	exportFileName,
	formatDate,
	formatDuration,
	percentOf,
	playlistUrl,
	thumbnailFor,
	videoUrl
} from './format.js';
import { makeVideo } from '$lib/testing/fixtures.js';

describe('formatDuration', () => {
	it('formats below an hour as m:ss', () => {
		expect(formatDuration(0)).toBe('0:00');
		expect(formatDuration(9)).toBe('0:09');
		expect(formatDuration(65)).toBe('1:05');
		expect(formatDuration(599)).toBe('9:59');
	});

	it('formats an hour and more as h:mm:ss', () => {
		expect(formatDuration(3600)).toBe('1:00:00');
		expect(formatDuration(3661)).toBe('1:01:01');
		expect(formatDuration(36000)).toBe('10:00:00');
	});

	it('truncates fractional seconds', () => {
		expect(formatDuration(90.9)).toBe('1:30');
	});

	it('returns an empty string for an unknown duration', () => {
		expect(formatDuration(null)).toBe('');
		expect(formatDuration(undefined)).toBe('');
		expect(formatDuration(-1)).toBe('');
		expect(formatDuration(Number.NaN)).toBe('');
		expect(formatDuration(/** @type {any} */ ('PT1M'))).toBe('');
	});
});

describe('formatDate', () => {
	it('formats an ISO timestamp', () => {
		// Built from local parts so the assertion does not depend on the timezone.
		expect(formatDate(new Date(2026, 8, 18, 12).toISOString())).toBe('18 Sep 2026');
		expect(formatDate(new Date(2024, 0, 1, 12).toISOString())).toBe('1 Jan 2024');
	});

	it('returns an empty string for anything unusable', () => {
		expect(formatDate('')).toBe('');
		expect(formatDate(null)).toBe('');
		expect(formatDate('not a date')).toBe('');
		expect(formatDate(/** @type {any} */ (42))).toBe('');
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

describe('playlistUrl', () => {
	it('builds the youtube.com playlist URL', () => {
		expect(playlistUrl('PLabcdef')).toBe('https://www.youtube.com/playlist?list=PLabcdef');
	});

	it('refuses ids that are not id-shaped, so nothing unescaped reaches an href', () => {
		expect(playlistUrl('legacy import')).toBe('');
		expect(playlistUrl('">bad')).toBe('');
		expect(playlistUrl(/** @type {any} */ (null))).toBe('');
	});
});

describe('videoUrl', () => {
	it('builds the watch URL', () => {
		expect(videoUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
	});

	it('returns an empty string for a non-video id', () => {
		expect(videoUrl('short')).toBe('');
	});
});

describe('exportFileName', () => {
	it('stamps the file with a zero-padded date', () => {
		expect(exportFileName(new Date(2026, 8, 5))).toBe('ytpt-export-2026-09-05.json');
		expect(exportFileName(new Date(2026, 11, 31))).toBe('ytpt-export-2026-12-31.json');
	});
});

describe('percentOf', () => {
	it('rounds to whole percent', () => {
		expect(percentOf(1, 3)).toBe(33);
		expect(percentOf(2, 3)).toBe(67);
		expect(percentOf(915, 915)).toBe(100);
	});

	it('returns 0 instead of NaN or Infinity', () => {
		expect(percentOf(0, 0)).toBe(0);
		expect(percentOf(5, 0)).toBe(0);
		expect(percentOf(Number.NaN, 10)).toBe(0);
	});

	it('clamps out-of-range input', () => {
		expect(percentOf(20, 10)).toBe(100);
		expect(percentOf(-5, 10)).toBe(0);
	});
});
