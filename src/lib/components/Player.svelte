<script>
	import { onMount } from 'svelte';
	import { currentVideo, isShowDummyVideo } from '$lib/state/Playlist.svelte';

	const sampleVideoId = 'M7lc1UVf-VE';

	function initializePlayer() {
		const videoId = currentVideo.id;
		const iframe = document.createElement('iframe');
		iframe.id = 'iframe-player';
		iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
		iframe.frameBorder = '0';
		iframe.allow =
			'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
		iframe.allowFullscreen = true;
		iframe.style.position = 'absolute';
		iframe.style.top = '0';
		iframe.style.left = '0';
		iframe.style.width = '100%';
		iframe.style.height = '100%';

		const playerContainer = document.getElementById('playerContainer');
		if (!playerContainer) {
			alert('Player container not found');
			return;
		}
		playerContainer.innerHTML = ''; // Clear any existing content
		playerContainer.appendChild(iframe);

		const player = new YT.Player('iframe-player', {
			events: {
				// onReady: () => {
				// 	debugger;
				// },
				// onStateChange: onPlayerStateChange,
				// onError: onPlayerError
			}
		});
	}

	onMount(() => {
		// currentVideo.id = sampleVideoId;
		// requestAnimationFrame(() => {
		// 	initializePlayer(sampleVideoId);
		// });
	});

	$effect(() => {
		if (currentVideo.id) {
			requestAnimationFrame(() => {
				// TODO check if player is already initialized, use some state for it
				// initializePlayer(sampleVideoId);
			});
		}
	});
</script>

<svelte:head>
	<script src="https://www.youtube.com/iframe_api"></script>
</svelte:head>

{#snippet dummy()}
	<div role="status" class="flex h-full w-full items-center justify-center rounded-xl border">
		<svg
			class="light:fg-current h-10 w-10 animate-pulse dark:text-secondary"
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			fill="currentColor"
			viewBox="0 0 16 20"
		>
			<path d="M5 5V.13a2.96 2.96 0 0 0-1.293.749L.879 3.707A2.98 2.98 0 0 0 .13 5H5Z" />
			<path
				d="M14.066 0H7v5a2 2 0 0 1-2 2H0v11a1.97 1.97 0 0 0 1.934 2h12.132A1.97 1.97 0 0 0 16 18V2a1.97 1.97 0 0 0-1.934-2ZM9 13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2Zm4 .382a1 1 0 0 1-1.447.894L10 13v-2l1.553-1.276a1 1 0 0 1 1.447.894v2.764Z"
			/>
		</svg>
		<span class="sr-only">Loading...</span>
	</div>
{/snippet}

{#if isShowDummyVideo()}
	<div class="relative h-[0] w-full pb-[56.25%]">
		<div class="t-[0] l-[0] absolute h-full w-full">{@render dummy()}</div>
	</div>
{:else}
	<div id="playerContainer" class="relative h-[0] w-full pb-[56.25%]"></div>
{/if}
