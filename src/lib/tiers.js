/**
 * Single source of truth for the six tiers: order, labels, keyboard keys and colours.
 * Used by TierBadge, the Browse tier picker and the Rate tier bar.
 */
import { RATING_ORDER } from '$lib/types.js';

/**
 * @typedef {Object} TierDefinition
 * @property {import('$lib/types.js').Rating} rating
 * @property {string} label - Human-readable label ("S tier").
 * @property {string} key - Lower-case keyboard key that assigns this tier.
 * @property {string} solid - Tailwind classes for a filled badge/button.
 * @property {string} soft - Tailwind classes for a tinted, outlined badge.
 * @property {string} ring - Tailwind classes for focus/selection rings.
 */

/** @type {Record<import('$lib/types.js').Rating, Omit<TierDefinition, 'rating' | 'label' | 'key'>>} */
const COLOURS = {
	S: {
		solid: 'bg-red-500 text-white hover:bg-red-600',
		soft: 'border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300',
		ring: 'ring-red-500'
	},
	A: {
		solid: 'bg-orange-500 text-white hover:bg-orange-600',
		soft: 'border-orange-500/40 bg-orange-500/15 text-orange-700 dark:text-orange-300',
		ring: 'ring-orange-500'
	},
	B: {
		solid: 'bg-amber-400 text-zinc-950 hover:bg-amber-500',
		soft: 'border-amber-400/50 bg-amber-400/20 text-amber-800 dark:text-amber-200',
		ring: 'ring-amber-400'
	},
	C: {
		solid: 'bg-lime-500 text-zinc-950 hover:bg-lime-600',
		soft: 'border-lime-500/40 bg-lime-500/15 text-lime-800 dark:text-lime-300',
		ring: 'ring-lime-500'
	},
	D: {
		solid: 'bg-sky-500 text-white hover:bg-sky-600',
		soft: 'border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300',
		ring: 'ring-sky-500'
	},
	F: {
		solid: 'bg-zinc-500 text-white hover:bg-zinc-600',
		soft: 'border-zinc-500/40 bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
		ring: 'ring-zinc-500'
	}
};

/** @type {TierDefinition[]} Best to worst, same order as RATING_ORDER. */
export const TIERS = RATING_ORDER.map((rating) => ({
	rating,
	label: `${rating} tier`,
	key: rating.toLowerCase(),
	...COLOURS[rating]
}));

/** @type {Record<string, TierDefinition>} Lookup behind {@link tierFor}. */
const TIER_BY_RATING = Object.fromEntries(TIERS.map((tier) => [tier.rating, tier]));

/** @type {Record<string, import('$lib/types.js').Rating>} lower-case key → rating */
export const RATING_BY_KEY = Object.fromEntries(TIERS.map((tier) => [tier.key, tier.rating]));

/**
 * What every tier button looks like regardless of where it sits: a centred, bold
 * glyph with one focus ring for the whole app.
 *
 * The two tier controls (the compact picker on a Browse card and the thumb-sized
 * bar on the Rate page) stay separate components — they have different jobs — but
 * this keeps their shared chrome from drifting apart. Layout, size and radius are
 * each control's own business; `cn()` lets them override anything here.
 *
 * @type {string}
 */
export const TIER_BUTTON_BASE =
	'flex cursor-pointer items-center justify-center font-bold transition select-none ' +
	'focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 ' +
	'focus-visible:ring-offset-2 focus-visible:outline-none';

/**
 * @param {import('$lib/types.js').Rating | null | undefined} rating
 * @returns {TierDefinition | null}
 */
export function tierFor(rating) {
	return rating ? (TIER_BY_RATING[rating] ?? null) : null;
}
