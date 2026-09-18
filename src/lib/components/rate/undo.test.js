import { describe, expect, it } from 'vitest';
import { describeUndo } from './undo.js';

/**
 * @param {Partial<import('$lib/state/session.svelte.js').UndoEntry>} [overrides]
 * @returns {any}
 */
function entry(overrides = {}) {
	return {
		kind: 'rate',
		videoId: 'v1',
		title: 'Test AMV 4',
		rating: 'C',
		previousRating: null,
		wasUnavailable: false,
		previousIndex: 0,
		...overrides
	};
}

describe('describeUndo', () => {
	it('names the video and the rating that would be taken back', () => {
		expect(describeUndo(entry())).toBe('Undo: Test AMV 4 → C');
	});

	it('words a cleared rating', () => {
		expect(describeUndo(entry({ rating: null }))).toBe('Undo: Test AMV 4 → no rating');
	});

	it('words "mark unavailable"', () => {
		expect(describeUndo(entry({ kind: 'unavailable', rating: null }))).toBe(
			'Undo: Test AMV 4 → unavailable'
		);
	});

	it('cuts a long title short', () => {
		const label = describeUndo(entry({ title: 'x'.repeat(80) }));
		expect(label).toContain('…');
		expect(label.length).toBeLessThan(60);
	});

	it('falls back when there is no step and no title', () => {
		expect(describeUndo(null)).toBe('Nothing to undo');
		expect(describeUndo(entry({ title: '  ' }))).toBe('Undo: this video → C');
	});
});
