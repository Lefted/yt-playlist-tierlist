import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// Pure client-side SPA: every route is served from a single index.html fallback.
		adapter: adapter({ fallback: 'index.html' })
	}
};

export default config;
