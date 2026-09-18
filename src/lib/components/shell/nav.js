import ListVideo from '@lucide/svelte/icons/list-video';
import Star from '@lucide/svelte/icons/star';

/**
 * A top-level destination of the app, rendered as a header link on desktop and as
 * a tab in the bottom bar on mobile.
 *
 * @typedef {object} NavItem
 * @property {import('$app/types').RouteId} route
 * @property {string} label
 * @property {import('svelte').Component<import('@lucide/svelte').LucideProps>} icon
 */

/** @type {NavItem[]} */
export const NAV_ITEMS = [
	{ route: '/browse', label: 'Browse', icon: ListVideo },
	{ route: '/rate', label: 'Rate', icon: Star }
];

/**
 * Whether a nav destination is the one currently shown.
 *
 * Sub-routes count as active (`/browse/xyz` highlights "Browse"), but a path that
 * merely starts with the same characters does not (`/browsers` does not).
 *
 * @param {string} href resolved href of the nav item
 * @param {string} pathname current `page.url.pathname`
 * @returns {boolean}
 */
export function isActiveRoute(href, pathname) {
	if (pathname === href) return true;
	const base = href.endsWith('/') ? href : `${href}/`;
	return pathname.startsWith(base);
}
