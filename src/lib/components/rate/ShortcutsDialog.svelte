<script>
	/**
	 * Edit the keys of the rating layer (issue #12).
	 *
	 * A dialog rather than a popover: a dozen rows do not fit one, and a dialog is an
	 * overlay — which is exactly what keeps the Rate page off the keyboard
	 * (`shortcutsEnabled`) while a row is listening for the next keystroke.
	 *
	 * Recording listens on `window` in the **capture** phase, so it sees the key
	 * before anything else can act on it: `Escape` would otherwise close the dialog
	 * instead of cancelling the recording, and `Space` would press the button that
	 * started it.
	 */
	import Plus from '@lucide/svelte/icons/plus';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import X from '@lucide/svelte/icons/x';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { settings } from '$lib/state/settings.svelte.js';
	import {
		BINDABLE_ACTIONS,
		DEFAULT_KEYBINDINGS,
		chordConflict,
		chordFor,
		chordLabel,
		withChord,
		withoutChord
	} from './shortcuts.js';

	/**
	 * @typedef {Object} Props
	 * @property {boolean} open - Bindable; the toolbar opens this from two places.
	 */

	/** @type {Props} */
	let { open = $bindable(false) } = $props();

	/** @type {string|null} The action whose row is waiting for a key. */
	let recording = $state(null);

	/**
	 * What to say under one row: a refusal, or a note about what the new chord
	 * shadows. One at a time — it is always about the row just touched.
	 *
	 * @type {{ action: string, text: string, blocked: boolean }|null}
	 */
	let message = $state(null);

	/** @type {string} A word about the dialog as a whole, e.g. after a reset. */
	let notice = $state('');

	const bindings = $derived(settings.keybindings);

	// Closing must not leave a row listening for the next keystroke, and the next
	// visit should not open on the last visit's error.
	$effect(() => {
		if (open) return;
		recording = null;
		message = null;
		notice = '';
	});

	/**
	 * @param {string} id
	 * @returns {void}
	 */
	function toggleRecording(id) {
		recording = recording === id ? null : id;
		message = null;
		notice = '';
	}

	/**
	 * @param {KeyboardEvent} event
	 * @returns {void}
	 */
	function handleKeydown(event) {
		const id = recording;
		if (!id) return;
		notice = '';

		if (event.key === 'Escape') {
			// Cancel the recording, not the whole edit: the dialog stays.
			event.preventDefault();
			event.stopPropagation();
			recording = null;
			return;
		}

		// A lone modifier is not a chord yet — keep waiting for the key it modifies.
		const chord = chordFor(event);
		if (!chord) return;

		event.preventDefault();
		event.stopPropagation();
		recording = null;

		const conflict = chordConflict(chord, bindings, id);
		if (conflict?.blocked) {
			message = { action: id, text: conflict.message, blocked: true };
			return;
		}

		settings.keybindings = withChord(bindings, id, chord);
		message = conflict ? { action: id, text: conflict.message, blocked: false } : null;
	}

	/**
	 * @param {string} id
	 * @param {string} chord
	 * @returns {void}
	 */
	function remove(id, chord) {
		settings.keybindings = withoutChord(bindings, id, chord);
		message = null;
		notice = '';
	}

	/** @returns {void} */
	function reset() {
		settings.keybindings = DEFAULT_KEYBINDINGS;
		recording = null;
		message = null;
		notice = 'Restored the default keys.';
	}
</script>

<svelte:window onkeydowncapture={handleKeydown} />

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[85svh] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Edit shortcuts</Dialog.Title>
			<Dialog.Description>
				A key you bind here beats YouTube's own player keys — bind a tier to
				<kbd class="font-mono">K</kbd> and it rates instead of pausing.
				<kbd class="font-mono">?</kbd> always opens the shortcut list and cannot be changed.
			</Dialog.Description>
		</Dialog.Header>

		<div class="grid gap-2">
			{#each BINDABLE_ACTIONS as action (action.id)}
				{@const chords = bindings[action.id] ?? []}
				<div class="grid gap-1 border-b pb-2 last:border-b-0">
					<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
						<span class="text-sm">{action.label}</span>

						<div class="flex flex-wrap items-center justify-end gap-1">
							{#each chords as chord (chord)}
								<span
									class="bg-muted inline-flex items-center gap-1 rounded border py-0.5 pr-0.5 pl-1.5"
								>
									<kbd class="font-mono text-xs">{chordLabel(chord)}</kbd>
									<button
										type="button"
										class="text-muted-foreground hover:text-foreground hover:bg-background cursor-pointer rounded p-0.5"
										aria-label={`Remove ${chordLabel(chord)} from ${action.label}`}
										onclick={() => remove(action.id, chord)}
									>
										<X class="size-3" aria-hidden="true" />
									</button>
								</span>
							{/each}

							<Button
								variant={recording === action.id ? 'secondary' : 'ghost'}
								size="sm"
								aria-label={`Add a key for ${action.label}`}
								onclick={() => toggleRecording(action.id)}
							>
								{#if recording === action.id}
									Press a key…
								{:else}
									<Plus aria-hidden="true" />
									Add key
								{/if}
							</Button>
						</div>
					</div>

					{#if recording === action.id}
						<p class="text-muted-foreground text-xs" role="status">
							Press the key to bind — <kbd class="font-mono">Esc</kbd> cancels.
						</p>
					{:else if message?.action === action.id}
						<p
							class={message.blocked ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}
						>
							{message.text}
						</p>
					{/if}
				</div>
			{/each}
		</div>

		<Dialog.Footer class="sm:items-center sm:justify-between" showCloseButton>
			<Button variant="outline" size="sm" onclick={reset}>
				<RotateCcw aria-hidden="true" />
				Reset to defaults
			</Button>
			{#if notice}
				<p class="text-muted-foreground text-xs" role="status">{notice}</p>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
