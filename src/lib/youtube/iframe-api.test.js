import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorReasonFor } from './iframe-api.js';

/**
 * A `document` stub with just enough DOM for the loader: a head that collects
 * appended scripts and a `getElementById` that finds them again.
 *
 * @returns {any}
 */
function createDocumentStub() {
	/** @type {any[]} */
	const scripts = [];
	return {
		scripts,
		createElement() {
			/** @type {any} */
			const element = {
				id: '',
				src: '',
				async: false,
				/** @type {(() => void)|null} */
				onerror: null,
				remove() {
					const index = scripts.indexOf(element);
					if (index !== -1) scripts.splice(index, 1);
				}
			};
			return element;
		},
		getElementById(/** @type {string} */ id) {
			return scripts.find((script) => script.id === id) ?? null;
		},
		head: {
			appendChild(/** @type {any} */ script) {
				scripts.push(script);
			}
		}
	};
}

/**
 * A fresh copy of the module, so the cached promise of one test never leaks into
 * the next one.
 *
 * @returns {Promise<typeof import('./iframe-api.js')>}
 */
async function freshModule() {
	vi.resetModules();
	return import('./iframe-api.js');
}

beforeEach(() => {
	vi.unstubAllGlobals();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('errorReasonFor', () => {
	it.each([100, 101, 150])('maps %i to "unavailable"', (code) => {
		expect(errorReasonFor(code)).toBe('unavailable');
	});

	it.each([2, 5, 153, undefined, null, 'nope'])('maps %s to "other"', (code) => {
		expect(errorReasonFor(code)).toBe('other');
	});
});

describe('loadIframeApi', () => {
	it('resolves immediately when the API is already present', async () => {
		const YT = { Player: class {} };
		vi.stubGlobal('YT', YT);
		const doc = createDocumentStub();
		vi.stubGlobal('document', doc);

		const { loadIframeApi } = await freshModule();

		await expect(loadIframeApi()).resolves.toBe(YT);
		expect(doc.scripts).toHaveLength(0);
	});

	it('injects the script once and resolves when the API calls back', async () => {
		const doc = createDocumentStub();
		vi.stubGlobal('document', doc);

		const { loadIframeApi } = await freshModule();
		const first = loadIframeApi();
		const second = loadIframeApi();

		expect(first).toBe(second);
		expect(doc.scripts).toHaveLength(1);
		expect(doc.scripts[0].src).toBe('https://www.youtube.com/iframe_api');
		expect(doc.scripts[0].async).toBe(true);

		const YT = { Player: class {} };
		vi.stubGlobal('YT', YT);
		/** @type {any} */ (globalThis).onYouTubeIframeAPIReady();

		await expect(first).resolves.toBe(YT);
	});

	it('keeps an already registered callback alive', async () => {
		const doc = createDocumentStub();
		vi.stubGlobal('document', doc);
		const previous = vi.fn();
		vi.stubGlobal('onYouTubeIframeAPIReady', previous);

		const { loadIframeApi } = await freshModule();
		const loading = loadIframeApi();

		vi.stubGlobal('YT', { Player: class {} });
		/** @type {any} */ (globalThis).onYouTubeIframeAPIReady();

		await loading;
		expect(previous).toHaveBeenCalledOnce();
	});

	it('does not add a second script tag when one is already in the document', async () => {
		const doc = createDocumentStub();
		doc.head.appendChild({ id: 'youtube-iframe-api', src: 'https://www.youtube.com/iframe_api' });
		vi.stubGlobal('document', doc);

		const { loadIframeApi } = await freshModule();
		loadIframeApi();

		expect(doc.scripts).toHaveLength(1);
	});

	it('rejects and allows a retry when the script fails to load', async () => {
		const doc = createDocumentStub();
		vi.stubGlobal('document', doc);

		const { loadIframeApi } = await freshModule();
		const failing = loadIframeApi();
		doc.scripts[0].onerror();

		await expect(failing).rejects.toThrow(/YouTube IFrame API/);

		// The failed attempt removed its script tag, so a retry starts a new one.
		expect(doc.scripts).toHaveLength(0);
		const retry = loadIframeApi();
		expect(retry).not.toBe(failing);
		expect(doc.scripts).toHaveLength(1);
	});
});
