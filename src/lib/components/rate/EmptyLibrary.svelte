<script>
	/** Nothing has been imported yet, so there is nothing to rate. */
	import { resolve } from '$app/paths';
	import ListVideo from '@lucide/svelte/icons/list-video';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
</script>

<div class="mx-auto flex w-full max-w-xl flex-1 items-center p-4">
	<Card.Root class="w-full">
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<ListVideo class="text-primary size-5" aria-hidden="true" />
				No playlist yet
			</Card.Title>
			<Card.Description>
				Import a YouTube playlist on the Browse page, then come back here to rate it.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button href={resolve('/browse')} size="lg">Go to Browse</Button>
		</Card.Content>
	</Card.Root>
</div>
