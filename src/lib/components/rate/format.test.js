import { describe, expect, it } from 'vitest';
import { formatDuration } from './format.js';

describe('formatDuration', () => {
	it('formats below an hour as m:ss', () => {
		expect(formatDuration(0)).toBe('0:00');
		expect(formatDuration(9)).toBe('0:09');
		expect(formatDuration(222)).toBe('3:42');
		expect(formatDuration(3599)).toBe('59:59');
	});

	it('formats an hour and more as h:mm:ss', () => {
		expect(formatDuration(3600)).toBe('1:00:00');
		expect(formatDuration(3723)).toBe('1:02:03');
	});

	it('truncates fractional seconds', () => {
		expect(formatDuration(61.9)).toBe('1:01');
	});

	it('renders nothing for an unknown or nonsensical duration', () => {
		expect(formatDuration(null)).toBe('');
		expect(formatDuration(undefined)).toBe('');
		expect(formatDuration(-1)).toBe('');
		expect(formatDuration(Number.NaN)).toBe('');
		expect(formatDuration(/** @type {any} */ ('90'))).toBe('');
	});
});
