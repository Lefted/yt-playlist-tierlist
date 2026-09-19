/**
 * What `use:enhance` has to do when a form action changes who is signed in.
 *
 * Every account form — sign in, sign up, sign out — answers with a redirect, and
 * SvelteKit's default handler would follow it without re-running the root layout
 * load. The header would then still show the previous user (or nobody), because
 * the only thing that knows is `GET /api/v1/me`, and only that load asks it. So:
 * navigate *and* invalidate.
 *
 * Three pages wanted the same eight lines; this is those eight lines.
 */

import { applyAction } from '$app/forms';
import { goto } from '$app/navigation';

/**
 * A `use:enhance` submit function that reloads the session on a successful action.
 *
 * @param {(submitting: boolean) => void} [onPending] - Told `true` while the request
 *   is in flight and `false` when it is done, for a button's disabled state.
 * @returns {import('$app/forms').SubmitFunction}
 */
export function enhanceAuthForm(onPending) {
	return () => {
		onPending?.(true);

		return async ({ result }) => {
			onPending?.(false);

			if (result.type === 'redirect') {
				// The target is the action's own `redirect()` — built and validated on the
				// server (`safeRedirect` in `routes.js`), not a route literal this app
				// chose here, so there is nothing for `resolve()` to take. One suppression
				// in one module, rather than the same one in three pages.
				// eslint-disable-next-line svelte/no-navigation-without-resolve
				await goto(result.location, { invalidateAll: true });
				return;
			}

			await applyAction(result);
		};
	};
}
