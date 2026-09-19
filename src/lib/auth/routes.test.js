import { describe, expect, it } from 'vitest';
import { isApiPath, isPublicPath, isShellFreePath, loginPathFor, safeRedirect } from './routes.js';

describe('isPublicPath', () => {
	it('lets the two probes of the deployment contract through', () => {
		expect(isPublicPath('/healthz')).toBe(true);
		expect(isPublicPath('/api/v1/meta')).toBe(true);
	});

	it('lets the ways into an account through, sub-paths included', () => {
		expect(isPublicPath('/login')).toBe(true);
		expect(isPublicPath('/invite')).toBe(true);
		expect(isPublicPath('/invite/abc123')).toBe(true);
	});

	it('does not let a path that merely starts with the same letters through', () => {
		expect(isPublicPath('/logins')).toBe(false);
		expect(isPublicPath('/invitations')).toBe(false);
		expect(isPublicPath('/healthzz')).toBe(false);
	});

	it('lets the client bundle and the files in static/ through', () => {
		expect(isPublicPath('/_app/immutable/entry/app.js')).toBe(true);
		expect(isPublicPath('/sw.js')).toBe(true);
		expect(isPublicPath('/manifest.webmanifest')).toBe(true);
		expect(isPublicPath('/workbox-835c8c05.js')).toBe(true);
		expect(isPublicPath('/pwa-192x192.png')).toBe(true);
		expect(isPublicPath('/favicon.png')).toBe(true);
	});

	it('does not extend the asset rule to nested paths', () => {
		// Otherwise `/admin/anything.js` would be a way past the gate.
		expect(isPublicPath('/admin/users.json')).toBe(false);
		expect(isPublicPath('/api/v1/library.json')).toBe(false);
	});

	it('keeps the app itself behind the gate', () => {
		expect(isPublicPath('/')).toBe(false);
		expect(isPublicPath('/browse')).toBe(false);
		expect(isPublicPath('/rate')).toBe(false);
		expect(isPublicPath('/admin')).toBe(false);
		expect(isPublicPath('/api/v1/me')).toBe(false);
		expect(isPublicPath('/logout')).toBe(false);
	});
});

describe('isApiPath', () => {
	it('recognises what is answered as JSON', () => {
		expect(isApiPath('/api/v1/me')).toBe(true);
		expect(isApiPath('/api')).toBe(true);
	});

	it('leaves the pages alone', () => {
		expect(isApiPath('/browse')).toBe(false);
		expect(isApiPath('/apiary')).toBe(false);
	});
});

describe('isShellFreePath', () => {
	it('drops the chrome on the pages you reach without an account', () => {
		expect(isShellFreePath('/login')).toBe(true);
		expect(isShellFreePath('/logout')).toBe(true);
		expect(isShellFreePath('/invite/abc')).toBe(true);
	});

	it('keeps it everywhere else', () => {
		expect(isShellFreePath('/browse')).toBe(false);
		expect(isShellFreePath('/admin')).toBe(false);
	});
});

describe('loginPathFor', () => {
	it('is the bare login path when there is nothing worth coming back to', () => {
		expect(loginPathFor('/browse')).toBe('/login');
		expect(loginPathFor()).toBe('/login');
	});

	it('carries the target along, encoded', () => {
		expect(loginPathFor('/rate?v=abc&tiers=S,A')).toBe(
			'/login?redirectTo=%2Frate%3Fv%3Dabc%26tiers%3DS%2CA'
		);
	});

	it('refuses to carry a target it would not follow', () => {
		expect(loginPathFor('https://evil.example/')).toBe('/login');
		expect(loginPathFor('//evil.example/')).toBe('/login');
	});
});

describe('safeRedirect', () => {
	it('keeps a path on this origin', () => {
		expect(safeRedirect('/rate?v=abc')).toBe('/rate?v=abc');
	});

	it('falls back for anything that could leave this origin', () => {
		expect(safeRedirect('https://evil.example/')).toBe('/browse');
		expect(safeRedirect('//evil.example/')).toBe('/browse');
		expect(safeRedirect('/\\evil.example/')).toBe('/browse');
		expect(safeRedirect('/\\\\evil.example')).toBe('/browse');
		expect(safeRedirect('javascript:alert(1)')).toBe('/browse');
		expect(safeRedirect('browse')).toBe('/browse');
	});

	it('falls back for anything that is not a string', () => {
		expect(safeRedirect(null)).toBe('/browse');
		expect(safeRedirect(undefined)).toBe('/browse');
		expect(safeRedirect(42)).toBe('/browse');
	});

	it('refuses a control character that could split a header', () => {
		expect(safeRedirect('/browse\nLocation: https://evil.example')).toBe('/browse');
		expect(safeRedirect('/browse\r\nSet-Cookie: x=1')).toBe('/browse');
	});

	it('refuses to send anyone back into the sign-in flow', () => {
		expect(safeRedirect('/login')).toBe('/browse');
		expect(safeRedirect('/login?redirectTo=%2Flogin')).toBe('/browse');
		expect(safeRedirect('/logout')).toBe('/browse');
		expect(safeRedirect('/invite/abc')).toBe('/browse');
	});

	it('takes the fallback it is given', () => {
		expect(safeRedirect('https://evil.example/', null)).toBe(null);
	});
});
