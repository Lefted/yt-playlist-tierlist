import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// A node server (`node build`, port 3000) rather than a static bundle: the app
		// needs its own origin for the session cookie, the `/api/v1` endpoints and the
		// server-side YouTube key. The pages themselves stay client-rendered —
		// `src/routes/+layout.js` keeps `ssr = false`, so every route still ships the
		// same empty shell the static build did and the client router takes it from
		// there.
		adapter: adapter()
	}
};

export default config;
