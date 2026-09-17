import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	css: {
		// Tailwind 4 runs through its own Vite plugin. Declaring an (empty) inline PostCSS
		// config stops Vite from searching parent directories for a stray postcss.config.js.
		postcss: { plugins: [] }
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,svelte.js}']
	}
});
