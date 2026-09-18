<script>
	/**
	 * The hidden `<input type="file">` behind "Restore from JSON" / "Import JSON",
	 * plus reading the file and turning the outcome into a notice.
	 *
	 * It renders nothing visible: the two trigger sites look nothing alike (a button
	 * in the empty state, a dropdown item on the playlist card) and stay their own,
	 * while the picker, the read and the error handling live here once.
	 *
	 * ```svelte
	 * <JsonFileInput bind:this={picker} onresult={(result) => (notice = result)} />
	 * <Button onclick={() => picker?.pick()}>Restore from JSON</Button>
	 * ```
	 */
	import { applyLibraryFile, takeFile } from './json-file.js';

	/**
	 * @typedef {Object} Props
	 * @property {(notice: import('./json-file.js').Notice) => void} onresult - How it
	 *   went. The caller decides where to render it — the playlist card, for one, shows
	 *   it in the same slot as its export result.
	 */

	/** @type {Props} */
	let { onresult } = $props();

	/** @type {HTMLInputElement | null} */
	let input = $state(null);

	/**
	 * Open the file picker.
	 * @returns {void}
	 */
	export function pick() {
		input?.click();
	}

	/**
	 * @param {Event} event
	 * @returns {Promise<void>}
	 */
	async function apply(event) {
		const file = takeFile(event);
		if (!file) return;
		onresult(await applyLibraryFile(file));
	}
</script>

<input
	bind:this={input}
	type="file"
	accept="application/json,.json"
	class="hidden"
	onchange={apply}
/>
