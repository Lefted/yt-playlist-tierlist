import { describe, expect, it } from 'vitest';
import { exportFileName, formatDate, formatDuration } from './format.js';

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

describe('exportFileName', () => {
	it('stamps the file with a zero-padded date', () => {
		expect(exportFileName(new Date(2026, 8, 5))).toBe('ytpt-export-2026-09-05.json');
		expect(exportFileName(new Date(2026, 11, 31))).toBe('ytpt-export-2026-12-31.json');
	});
});
