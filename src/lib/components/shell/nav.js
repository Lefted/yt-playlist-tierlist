import { resolve } from '$app/paths';
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

/**
 * A destination plus whether it is the one currently shown.
 *
 * @typedef {NavItem & { active: boolean }} CurrentNavItem
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
	return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The nav destinations, each tagged with whether it is the current one. Both the
 * header and the bottom tab bar render from this, so their active states cannot
 * drift apart. The `route` is handed back unresolved, so that each call site
 * resolves its own `href` (which is what `svelte/no-navigation-without-resolve`
 * wants to see).
 *
 * @param {string} pathname current `page.url.pathname`
 * @returns {CurrentNavItem[]}
 */
export function navItemsFor(pathname) {
	return NAV_ITEMS.map((item) => ({
		...item,
		active: isActiveRoute(resolve(item.route), pathname)
	}));
}
