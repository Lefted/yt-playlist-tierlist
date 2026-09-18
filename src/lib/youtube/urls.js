/**
 * The youtube.com URLs the UI links to, and the thumbnail URL a video falls back
 * to. Pure string building, no I/O — `api.js` is the module that talks to the API.
 *
 * Every function returns `''` for anything that is not a real YouTube id, so a
 * local-only playlist (the `legacy-import` collection) never grows a dead link.
 */

/** @typedef {import('../types.js').Video} Video */

/** A YouTube video id. Playlist-item ids used as a stand-in id are longer. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * A YouTube playlist id: one of YouTube's playlist prefixes followed by id
 * characters. The prefix is what separates a real playlist from a local id such
 * as `legacy-import`.
 */
const PLAYLIST_ID = /^(?:PL|UU|FL|LL|RD|OL|TL|SP|PU|WL)[A-Za-z0-9_-]*$/;

/**
 * @param {string} playlistId
 * @returns {string} The playlist on youtube.com, `''` when the id is not one
 *   YouTube could know (a legacy import, or anything not id-shaped).
 */
export function playlistUrl(playlistId) {
	return typeof playlistId === 'string' && PLAYLIST_ID.test(playlistId)
		? `https://www.youtube.com/playlist?list=${playlistId}`
		: '';
}

/**
 * The thumbnail to show for a video. Imports carry one, but a legacy JSON import
 * or a hand-written export may not — and for those `i.ytimg.com` can be derived
 * from the video id (and is precached by the service worker either way).
 *
 * @param {Video} video
 * @returns {string} `''` when there is nothing to show.
 */
export function thumbnailFor(video) {
	if (video?.thumbnail) return video.thumbnail;
	const id = video?.id ?? '';
	return VIDEO_ID.test(id) ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : '';
}
