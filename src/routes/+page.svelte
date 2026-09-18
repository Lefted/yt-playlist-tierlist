<script>
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';

	const browse = resolve('/browse');

	// `/` has no content of its own; the library is the app's home. `replaceState`
	// keeps it out of the history so "back" leaves the app instead of looping here.
	$effect(() => {
		goto(browse, { replaceState: true });
	});
</script>

<main class="flex flex-1 items-center justify-center p-8">
	<p class="text-muted-foreground text-sm">
		Taking you to <a class="text-foreground underline underline-offset-4" href={browse}>Browse</a>…
	</p>
</main>
