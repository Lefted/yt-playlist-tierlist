// jsdoc type for a rating enum
/**
 * @typedef {('S'|'A'|'B'|'C'|'D'|'F')} Rating
 */

// jsdoc type for a video object
/**
 * @typedef {Object} Video
 * @property {string} id - The video ID
 * @property {string} title - The video title
 * @property {string} description - The video description
 * @property {string} thumbnail - The video thumbnail URL
 * @property {string} duration - The video duration
 * @property {string} channel - The video channel name
 * @property {string} publishedAt - The video publish date
 * @property {Rating} rating - The video rating
 * @property {boolean} watched - The video watched status
 * @property {boolean} blocked - The video blocked status
 */

// jsdoc type for a playlist object
/**
 * @typedef {Object} Playlist
 * @property {string} id - The playlist ID
 * @property {string} title - The playlist title
 * @property {string} description - The playlist description
 * @property {string} thumbnail - The playlist thumbnail URL
 * @property {string} channel - The playlist channel name
 * @property {string} channelThumbnail - The playlist channel thumbnail URL
 * @property {string} publishedAt - The playlist publish date
 * @property {Video[]} videos - The playlist videos
 */

/**
 * @file Playlist.svelte
 * @description This file contains the Playlist component which manages the state of a playlist.
 *
 * @typedef {Object} Playlist
 * @property {string} id - The playlist ID
 * @property {string} title - The playlist title
 * @property {string} description - The playlist description
 * @property {string} thumbnail - The playlist thumbnail URL
 * @property {string} channel - The playlist channel name
 * @property {string} channelThumbnail - The playlist channel thumbnail URL
 * @property {string} publishedAt - The playlist publish date
 * @property {Video[]} videos - The playlist videos
 *
 * @type {Playlist[]}
 * @default []
 */

/** * @type {Playlist} */
export let playlist = $state({});
/** @type {Video} */
export let currentVideo = $state({});
let isShowDummy = $derived(currentVideo === {});

export function isShowDummyVideo() {
	return isShowDummy;
}
