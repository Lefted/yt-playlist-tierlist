/**
 * Placeholder playlist state. The real domain model and persistence land with the
 * playlist/import tickets; this module only keeps the existing UI compiling.
 */

/**
 * @typedef {('S'|'A'|'B'|'C'|'D'|'F')} Rating
 */

/**
 * @typedef {Object} Video
 * @property {string} [id] - The video ID
 * @property {string} [title] - The video title
 * @property {string} [description] - The video description
 * @property {string} [thumbnail] - The video thumbnail URL
 * @property {string} [duration] - The video duration
 * @property {string} [channel] - The video channel name
 * @property {string} [publishedAt] - The video publish date
 * @property {Rating|null} [rating] - The video rating
 * @property {boolean} [watched] - The video watched status
 * @property {boolean} [blocked] - The video blocked status
 */

/**
 * @typedef {Object} Playlist
 * @property {string} [id] - The playlist ID
 * @property {string} [title] - The playlist title
 * @property {string} [description] - The playlist description
 * @property {string} [thumbnail] - The playlist thumbnail URL
 * @property {string} [channel] - The playlist channel name
 * @property {string} [channelThumbnail] - The playlist channel thumbnail URL
 * @property {string} [publishedAt] - The playlist publish date
 * @property {Video[]} [videos] - The playlist videos
 */

/** @type {Playlist} */
export const playlist = $state({});

/** @type {Video} */
export const currentVideo = $state({});

/**
 * @returns {boolean} whether the player should render its loading placeholder
 */
export function isShowDummyVideo() {
	return !currentVideo.id;
}
