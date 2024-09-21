<script>
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';

	import Navbar from '$lib/components/Navbar.svelte';
	let { children } = $props();
</script>

<ModeWatcher />
<div class="flex min-h-screen w-full flex-col">
	<header class="sticky top-0 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
		<Navbar />
	</header>
	<main class="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
		{@render children()}
	</main>
</div>
