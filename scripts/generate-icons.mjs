/**
 * Rasterizes the app icon into the PNG sizes the web app manifest, Apple and the
 * favicon need, and writes the vector favicon.
 *
 * The generated files are committed, so a normal `npm run build` never depends on
 * this script (or on `sharp`). Re-run it with `node scripts/generate-icons.mjs`
 * after changing the motif below.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const staticDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'static');

/** zinc-950 — the dark palette's background, also the manifest `background_color`. */
const BACKGROUND = '#09090b';
/**
 * The orange accent of the S tier. `--primary` in `src/app.css` is orange in both
 * palettes — oklch(0.705 0.213 47.604) light and oklch(0.646 0.222 41.116) dark —
 * and these are the sRGB hex equivalents of that pair.
 */
const ACCENT_FROM = '#fb923c';
const ACCENT_TO = '#ea580c';

/**
 * The "S" of the S-tier badge, drawn as a stroked path so that rendering never
 * depends on a font being installed.
 */
const S_PATH =
	'M320 192c0-32-30-46-64-46s-60 18-60 50 26 44 60 52 60 20 60 52-26 50-60 50-64-14-64-46';

/**
 * Builds the icon as an SVG string.
 *
 * @param {object} options
 * @param {'rounded' | 'square'} options.shape outer silhouette of the icon
 * @param {number} [options.scale] size of the badge relative to the canvas; use
 *   `0.8` for maskable icons so the motif stays inside the safe zone
 * @returns {string} a standalone 512x512 SVG document
 */
function iconSvg({ shape, scale = 1 }) {
	const backdrop =
		shape === 'rounded'
			? '<rect width="512" height="512" rx="112" fill="url(#bg)" />'
			: '<rect width="512" height="512" fill="url(#bg)" />';
	const offset = (512 * (1 - scale)) / 2;

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
	<defs>
		<linearGradient id="badge" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="${ACCENT_FROM}" />
			<stop offset="1" stop-color="${ACCENT_TO}" />
		</linearGradient>
		<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#18181b" />
			<stop offset="1" stop-color="${BACKGROUND}" />
		</linearGradient>
	</defs>
	${backdrop}
	<g transform="translate(${offset} ${offset}) scale(${scale})">
		<rect x="96" y="96" width="320" height="320" rx="76" fill="url(#badge)" />
		<path d="${S_PATH}" fill="none" stroke="${BACKGROUND}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round" />
	</g>
</svg>`;
}

/** @type {{ file: string; size: number; shape: 'rounded' | 'square'; scale?: number }[]} */
const targets = [
	{ file: 'favicon.png', size: 64, shape: 'rounded' },
	{ file: 'pwa-192x192.png', size: 192, shape: 'rounded' },
	{ file: 'pwa-512x512.png', size: 512, shape: 'rounded' },
	{ file: 'maskable-icon-512x512.png', size: 512, shape: 'square', scale: 0.8 },
	{ file: 'apple-touch-icon-180x180.png', size: 180, shape: 'square' }
];

await mkdir(staticDir, { recursive: true });
await writeFile(join(staticDir, 'favicon.svg'), `${iconSvg({ shape: 'rounded' })}\n`, 'utf8');
console.log('wrote static/favicon.svg');

for (const { file, size, shape, scale } of targets) {
	const png = await sharp(Buffer.from(iconSvg({ shape, scale })))
		.resize(size, size)
		.png({ compressionLevel: 9 })
		.toBuffer();
	await writeFile(join(staticDir, file), png);
	console.log(`wrote static/${file} (${size}x${size})`);
}
