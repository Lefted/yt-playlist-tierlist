import { describe, expect, it } from 'vitest';
import {
	API_ERROR_REASONS,
	isApiErrorReason,
	parseIsoDuration,
	parsePlaylistInput
} from './api.js';

describe('parsePlaylistInput', () => {
	it('accepts a bare playlist id', () => {
		expect(parsePlaylistInput('PLZbXA4lyCtqoc4dKMILBiS-RmxvvMEqdc')).toBe(
			'PLZbXA4lyCtqoc4dKMILBiS-RmxvvMEqdc'
		);
	});

	it('trims whitespace', () => {
		expect(parsePlaylistInput('  PLZbXA4lyCtqoc4dKMILBiS-RmxvvMEqdc  ')).toBe(
			'PLZbXA4lyCtqoc4dKMILBiS-RmxvvMEqdc'
		);
	});

	it('accepts the other playlist id prefixes', () => {
		for (const id of ['UUZbXA4lyCtqoc4dKMILBiS', 'OLAK5uy_l1234567890abc', 'RDZbXA4lyCtqoc4d']) {
			expect(parsePlaylistInput(id)).toBe(id);
		}
	});

	it('does not mistake an arbitrary word for a bare id', () => {
		expect(parsePlaylistInput('hello')).toBeNull();
		expect(parsePlaylistInput('playlist')).toBeNull();
		// Right prefix, far too short to be a real id.
		expect(parsePlaylistInput('PLabc123')).toBeNull();
	});

	it('still trusts anything list= points at', () => {
		expect(parsePlaylistInput('https://www.youtube.com/playlist?list=WL')).toBe('WL');
	});

	it('reads list= from a watch URL', () => {
		expect(
			parsePlaylistInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123&index=3')
		).toBe('PLabc123');
	});

	it('reads list= from a playlist URL', () => {
		expect(parsePlaylistInput('https://www.youtube.com/playlist?list=PLabc123')).toBe('PLabc123');
	});

	it('reads list= from a short URL with a fragment', () => {
		expect(parsePlaylistInput('https://youtu.be/dQw4w9WgXcQ?list=PLabc123#t=10')).toBe('PLabc123');
	});

	it('rejects garbage', () => {
		expect(parsePlaylistInput('not a playlist')).toBeNull();
		expect(parsePlaylistInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
		expect(parsePlaylistInput('')).toBeNull();
		expect(parsePlaylistInput('   ')).toBeNull();
		expect(parsePlaylistInput(null)).toBeNull();
		expect(parsePlaylistInput(42)).toBeNull();
	});
});

describe('parseIsoDuration', () => {
	it('parses minutes and seconds', () => {
		expect(parseIsoDuration('PT4M13S')).toBe(253);
	});

	it('parses hours', () => {
		expect(parseIsoDuration('PT1H2M3S')).toBe(3723);
	});

	it('parses days and weeks', () => {
		expect(parseIsoDuration('P1DT1S')).toBe(86401);
		expect(parseIsoDuration('P1W')).toBe(604800);
	});

	it('parses zero and fractional seconds', () => {
		expect(parseIsoDuration('PT0S')).toBe(0);
		expect(parseIsoDuration('PT1M30.4S')).toBe(90);
	});

	it('returns null for anything that is not a duration', () => {
		for (const value of ['', 'P', 'PT', '4M13S', 'hello', undefined, null, 42]) {
			expect(parseIsoDuration(value)).toBeNull();
		}
	});
});

describe('API_ERROR_REASONS', () => {
	it('is the closed list the server and the error copy share', () => {
		expect(API_ERROR_REASONS).toEqual([
			'quotaExceeded',
			'keyInvalid',
			'keyMissing',
			'playlistNotFound',
			'network',
			'unknown'
		]);
		for (const reason of API_ERROR_REASONS) expect(isApiErrorReason(reason)).toBe(true);
		expect(isApiErrorReason('teapot')).toBe(false);
		expect(isApiErrorReason(null)).toBe(false);
	});
});
