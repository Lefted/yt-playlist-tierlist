import { describe, expect, it } from 'vitest';
import { awaitsRating, endedAction } from './playback.js';

describe('endedAction', () => {
	it.each([
		// loop, rated, autoAdvance, expected
		[false, false, true, 'await'],
		[false, true, true, 'advance'],
		[false, false, false, 'stay'],
		[false, true, false, 'stay'],
		[true, false, true, 'restart'],
		[true, true, true, 'restart'],
		[true, false, false, 'restart'],
		[true, true, false, 'restart']
	])('loop=%s rated=%s autoAdvance=%s → %s', (loop, rated, autoAdvance, expected) => {
		expect(endedAction({ loop, rated, autoAdvance })).toBe(expected);
	});

	it('waits for a verdict by default', () => {
		expect(endedAction()).toBe('await');
	});
});

describe('awaitsRating', () => {
	it('highlights the tier bar when an unrated video ended', () => {
		expect(awaitsRating({ action: 'await', rated: false })).toBe(true);
	});

	it('highlights it on the first end of a looping unrated video too', () => {
		expect(awaitsRating({ action: 'restart', rated: false })).toBe(true);
	});

	it('stays quiet for a video that already has a tier', () => {
		expect(awaitsRating({ action: 'advance', rated: true })).toBe(false);
		expect(awaitsRating({ action: 'restart', rated: true })).toBe(false);
	});

	it('stays quiet while auto-advance is off', () => {
		expect(awaitsRating({ action: 'stay', rated: false })).toBe(false);
	});
});
