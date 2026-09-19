/**
 * The one way non-component code raises a message to the user.
 *
 * `$lib/state/library.svelte.js` applies a rating before the server has agreed to
 * it, and has to say so when the server then refuses — but a state module has no
 * markup to put that in, and handing every page a callback to register would make
 * the notice a wiring problem instead of a sentence.
 *
 * A module of its own rather than importing `svelte-sonner` directly: the toaster is
 * mounted once in `src/routes/+layout.svelte`, and a unit test that exercises a
 * rollback wants to assert the message, not render a toast.
 */

import { toast } from 'svelte-sonner';

/**
 * Something went wrong and the user needs to know.
 *
 * @param {string} message - One complete sentence.
 * @param {{ description?: string }} [options]
 * @returns {void}
 */
export function notifyError(message, options = {}) {
	toast.error(message, options.description ? { description: options.description } : undefined);
}
