import { describe, expect, it } from 'vitest';
import { playerVarsFor } from './player-vars.js';

describe('playerVarsFor', () => {
	it('leaves the embed without a fullscreen button of its own', () => {
		// The one parameter this module exists for: YouTube's button fullscreens the
		// cross-origin iframe, and then neither the shortcuts nor the rating overlay
		// are ours any more (issues #9 and #20).
		expect(playerVarsFor().fs).toBe(0);
	});

	it('keeps playback inline on iOS and the API talking to this origin', () => {
		const vars = playerVarsFor({ origin: 'https://example.test' });

		expect(vars.playsinline).toBe(1);
		expect(vars.enablejsapi).toBe(1);
		expect(vars.origin).toBe('https://example.test');
	});

	it('turns autoplay into the 0/1 the embed wants', () => {
		expect(playerVarsFor({ autoplay: true }).autoplay).toBe(1);
		expect(playerVarsFor({ autoplay: false }).autoplay).toBe(0);
		// Autoplay is the session's normal case, so it is also the default.
		expect(playerVarsFor().autoplay).toBe(1);
	});
});
