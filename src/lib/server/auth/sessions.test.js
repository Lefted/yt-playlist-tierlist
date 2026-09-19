import { describe, expect, it } from 'vitest';
import {
	SESSION_COOKIE,
	SESSION_REFRESH_AFTER_MS,
	SESSION_TTL_MS,
	sessionCookieOptions,
	sessionExpired,
	sessionRefreshDue
} from './sessions.js';

const DAY = 24 * 60 * 60 * 1000;

describe('sessionCookieOptions', () => {
	it('is the cookie #14 and #16 specify', () => {
		const options = sessionCookieOptions({ secure: true });

		expect(SESSION_COOKIE).toBe('amv_session');
		expect(options.path).toBe('/');
		expect(options.httpOnly).toBe(true);
		expect(options.sameSite).toBe('lax');
		expect(options.secure).toBe(true);
	});

	it('drops Secure outside production, or the cookie would not survive http://localhost', () => {
		expect(sessionCookieOptions({ secure: false }).secure).toBe(false);
	});

	it('expires in the browser when it expires in the database', () => {
		expect(sessionCookieOptions({ secure: true }).maxAge).toBe(SESSION_TTL_MS / 1000);
		expect(SESSION_TTL_MS).toBe(30 * DAY);
	});
});

describe('sessionExpired', () => {
	const now = Date.UTC(2026, 8, 19, 12, 0, 0);

	it('is false while there is time left', () => {
		expect(sessionExpired(new Date(now + 1), now)).toBe(false);
	});

	it('is true at the very moment it runs out', () => {
		expect(sessionExpired(new Date(now), now)).toBe(true);
		expect(sessionExpired(new Date(now - 1), now)).toBe(true);
	});
});

describe('sessionRefreshDue', () => {
	const now = Date.UTC(2026, 8, 19, 12, 0, 0);

	it('leaves a session that was used a moment ago alone', () => {
		// Otherwise every page view would be a write and a Set-Cookie.
		expect(sessionRefreshDue(new Date(now), now)).toBe(false);
		expect(sessionRefreshDue(new Date(now - 60_000), now)).toBe(false);
	});

	it('pushes the expiry out once a day of use has passed', () => {
		expect(sessionRefreshDue(new Date(now - SESSION_REFRESH_AFTER_MS), now)).toBe(true);
		expect(sessionRefreshDue(new Date(now - 8 * DAY), now)).toBe(true);
		expect(SESSION_REFRESH_AFTER_MS).toBe(DAY);
	});
});
