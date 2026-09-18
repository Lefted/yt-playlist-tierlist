/**
 * YouTube Data API v3 access.
 *
 * Pure functions: the API key is passed in, nothing is cached and nothing is
 * persisted. Failures arrive as {@link YouTubeApiError} with a machine-readable
 * `reason` so the UI can show a real message instead of an `alert()`.
 */

/** @typedef {import('../types.js').Video} Video */

/**
 * Metadata of a playlist, without its videos.
 * @typedef {Object} PlaylistMeta
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} channelTitle
 * @property {string} thumbnail
 * @property {number} itemCount
 */

/**
 * @typedef {'quotaExceeded'|'keyInvalid'|'playlistNotFound'|'network'|'unknown'} ApiErrorReason
 */

/**
 * Progress of a running import.
 * @typedef {Object} ImportProgress
 * @property {'items'|'durations'} phase
 * @property {number} loaded - Videos handled so far in this phase.
 * @property {number} total - Best known total for this phase.
 */

const API_BASE = 'https://www.googleapis.com/youtube/v3';

/** Titles YouTube substitutes for entries the API key may not see. */
const UNAVAILABLE_TITLES = new Set(['Private video', 'Deleted video']);

/** Thumbnail sizes, best first. */
const THUMBNAIL_SIZES = ['maxres', 'standard', 'high', 'medium', 'default'];

/** API `reason` strings that all mean "you are out of quota". */
const QUOTA_REASONS = new Set([
	'quotaExceeded',
	'dailyLimitExceeded',
	'rateLimitExceeded',
	'userRateLimitExceeded'
]);

/** API `reason` strings that all mean "this key will never work". */
const KEY_REASONS = new Set([
	'keyInvalid',
	'keyExpired',
	'ipRefererBlocked',
	'accessNotConfigured',
	'forbidden'
]);

/** API `reason` strings that all mean "no such playlist". */
const NOT_FOUND_REASONS = new Set(['playlistNotFound', 'notFound', 'videoNotFound']);

/**
 * A failed YouTube API call.
 */
export class YouTubeApiError extends Error {
	/**
	 * @param {string} message
	 * @param {ApiErrorReason} reason
	 * @param {{ cause?: unknown, status?: number|null }} [options]
	 */
	constructor(message, reason, options = {}) {
		super(message, { cause: options.cause });
		this.name = 'YouTubeApiError';
		/** @type {ApiErrorReason} */
		this.reason = reason;
		/** @type {number|null} HTTP status, `null` when the request never completed. */
		this.status = options.status ?? null;
	}
}

/**
 * Extract a playlist id from anything a user might paste: a bare id, a playlist
 * URL, or a watch URL that carries `list=`.
 *
 * @param {unknown} input
 * @returns {string|null} The playlist id, or `null` when nothing usable was found.
 */
export function parsePlaylistInput(input) {
	if (typeof input !== 'string') return null;
	const trimmed = input.trim();
	if (trimmed === '') return null;

	const fromUrl = /[?&#]list=([^&#\s]+)/.exec(trimmed);
	if (fromUrl) {
		const id = safeDecode(fromUrl[1]);
		return isPlaylistId(id) ? id : null;
	}

	// A bare id never contains scheme, path or query characters.
	return isPlaylistId(trimmed) ? trimmed : null;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isPlaylistId(value) {
	return /^[A-Za-z0-9_-]{2,}$/.test(value);
}

/**
 * @param {string} value
 * @returns {string}
 */
function safeDecode(value) {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/**
 * Seconds of an ISO 8601 duration as returned by `videos.contentDetails.duration`.
 *
 * @param {unknown} duration - e.g. `PT4M13S`, `P1DT2H`, `PT1M30.5S`.
 * @returns {number|null} `null` when the input is not a duration.
 */
export function parseIsoDuration(duration) {
	if (typeof duration !== 'string') return null;
	const match =
		/^P(?!$)(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?!$)(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
			duration.trim()
		);
	if (!match) return null;
	const [, weeks, days, hours, minutes, seconds] = match;
	const total =
		num(weeks) * 604800 + num(days) * 86400 + num(hours) * 3600 + num(minutes) * 60 + num(seconds);
	return Math.round(total);
}

/**
 * @param {string|undefined} value
 * @returns {number}
 */
function num(value) {
	return value === undefined ? 0 : Number(value);
}

/**
 * Fetch title, channel and item count of a playlist.
 *
 * @param {string} apiKey
 * @param {string} playlistId
 * @returns {Promise<PlaylistMeta>}
 * @throws {YouTubeApiError}
 */
export async function fetchPlaylistMeta(apiKey, playlistId) {
	const data = await request('playlists', {
		part: 'snippet,contentDetails',
		id: playlistId,
		maxResults: '1',
		key: apiKey
	});

	const item = data.items?.[0];
	if (!item) {
		throw new YouTubeApiError(`No playlist found for id "${playlistId}".`, 'playlistNotFound', {
			status: 200
		});
	}

	const snippet = item.snippet ?? {};
	return {
		id: item.id ?? playlistId,
		title: snippet.title ?? '',
		description: snippet.description ?? '',
		channelTitle: snippet.channelTitle ?? '',
		thumbnail: pickThumbnail(snippet.thumbnails),
		itemCount: item.contentDetails?.itemCount ?? 0
	};
}

/**
 * Fetch every video of a playlist, including its duration.
 *
 * Walks all `playlistItems` pages, then resolves durations in batches of 50 via
 * `videos` — the legacy app asked for `part=snippet` only and therefore never had
 * a duration.
 *
 * @param {string} apiKey
 * @param {string} playlistId
 * @param {(progress: ImportProgress) => void} [onProgress]
 * @returns {Promise<Video[]>} In playlist position order.
 * @throws {YouTubeApiError}
 */
export async function fetchPlaylistVideos(apiKey, playlistId, onProgress) {
	/** @type {any[]} */
	const items = [];
	let pageToken = '';

	do {
		/** @type {Record<string, string>} */
		const params = {
			part: 'snippet,contentDetails',
			maxResults: '50',
			playlistId,
			key: apiKey
		};
		if (pageToken) params.pageToken = pageToken;

		const data = await request('playlistItems', params);
		items.push(...(data.items ?? []));
		pageToken = data.nextPageToken ?? '';
		onProgress?.({
			phase: 'items',
			loaded: items.length,
			total: data.pageInfo?.totalResults ?? items.length
		});
	} while (pageToken);

	const videos = items.map(toVideo);
	await attachDurations(apiKey, videos, onProgress);
	return videos;
}

/**
 * @param {any} item - A `playlistItems` resource.
 * @param {number} index
 * @returns {Video}
 */
function toVideo(item, index) {
	const snippet = item?.snippet ?? {};
	const videoId = snippet.resourceId?.videoId ?? null;
	const title = snippet.title ?? '';

	return {
		id: videoId ?? item?.id ?? `unavailable-${index}`,
		title,
		description: snippet.description ?? '',
		thumbnail: pickThumbnail(snippet.thumbnails),
		channelTitle: snippet.videoOwnerChannelTitle ?? snippet.channelTitle ?? '',
		publishedAt: item?.contentDetails?.videoPublishedAt ?? snippet.publishedAt ?? '',
		position: typeof snippet.position === 'number' ? snippet.position : index,
		durationSeconds: null,
		rating: null,
		unavailable: videoId === null || UNAVAILABLE_TITLES.has(title)
	};
}

/**
 * Fill in `durationSeconds` for all playable videos, mutating them in place.
 *
 * @param {string} apiKey
 * @param {Video[]} videos
 * @param {(progress: ImportProgress) => void} [onProgress]
 * @returns {Promise<void>}
 */
async function attachDurations(apiKey, videos, onProgress) {
	const playable = videos.filter((video) => !video.unavailable);
	if (playable.length === 0) return;

	/** @type {Map<string, Video[]>} */
	const byId = new Map();
	for (const video of playable) {
		const bucket = byId.get(video.id);
		if (bucket) bucket.push(video);
		else byId.set(video.id, [video]);
	}

	const ids = [...byId.keys()];
	let loaded = 0;

	for (let start = 0; start < ids.length; start += 50) {
		const batch = ids.slice(start, start + 50);
		const data = await request('videos', {
			part: 'contentDetails',
			id: batch.join(','),
			maxResults: '50',
			key: apiKey
		});

		for (const item of data.items ?? []) {
			const seconds = parseIsoDuration(item?.contentDetails?.duration);
			for (const video of byId.get(item?.id) ?? []) video.durationSeconds = seconds;
		}

		loaded += batch.length;
		onProgress?.({ phase: 'durations', loaded, total: ids.length });
	}
}

/**
 * @param {any} thumbnails - A `snippet.thumbnails` object.
 * @returns {string}
 */
function pickThumbnail(thumbnails) {
	if (!thumbnails) return '';
	for (const size of THUMBNAIL_SIZES) {
		const url = thumbnails[size]?.url;
		if (typeof url === 'string' && url !== '') return url;
	}
	return '';
}

/**
 * One GET against the Data API, with errors normalised to {@link YouTubeApiError}.
 *
 * @param {string} path - Resource name, e.g. `playlistItems`.
 * @param {Record<string, string>} params - Query parameters, already unencoded.
 * @returns {Promise<any>} The parsed JSON body.
 * @throws {YouTubeApiError}
 */
async function request(path, params) {
	const url = new URL(`${API_BASE}/${path}`);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

	if (!params.key) {
		throw new YouTubeApiError('No YouTube API key configured.', 'keyInvalid');
	}

	/** @type {Response} */
	let response;
	try {
		response = await globalThis.fetch(url.toString());
	} catch (cause) {
		throw new YouTubeApiError('Could not reach the YouTube API.', 'network', { cause });
	}

	/** @type {any} */
	let data = null;
	try {
		data = await response.json();
	} catch (cause) {
		if (response.ok) {
			throw new YouTubeApiError('The YouTube API returned an unreadable response.', 'unknown', {
				cause,
				status: response.status
			});
		}
	}

	if (!response.ok || data?.error) throw toApiError(data, response.status);
	return data ?? {};
}

/**
 * Map an API error body (plus HTTP status) onto a {@link YouTubeApiError}.
 *
 * @param {any} data - The parsed error body, may be `null`.
 * @param {number} status
 * @returns {YouTubeApiError}
 */
function toApiError(data, status) {
	const error = data?.error ?? {};
	const reason = error.errors?.[0]?.reason ?? '';
	const message = error.message || `The YouTube API request failed (HTTP ${status}).`;

	/** @type {ApiErrorReason} */
	let mapped = 'unknown';
	if (QUOTA_REASONS.has(reason)) mapped = 'quotaExceeded';
	else if (KEY_REASONS.has(reason)) mapped = 'keyInvalid';
	else if (NOT_FOUND_REASONS.has(reason)) mapped = 'playlistNotFound';
	else if (status === 404) mapped = 'playlistNotFound';
	else if (status === 401 || status === 400) mapped = 'keyInvalid';
	else if (status === 403) mapped = 'quotaExceeded';

	return new YouTubeApiError(message, mapped, { status });
}
