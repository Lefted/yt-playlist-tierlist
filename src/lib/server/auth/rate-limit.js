/**
 * A sliding-window attempt counter, in memory.
 *
 * **Per process.** Two replicas each allow the full quota, and a restart forgets
 * everything — so this is a brake on password guessing, not a security boundary. It
 * is the right size for this app (#14: one small deployment behind one ingress) and
 * it needs no Redis; if the app ever scales out far enough for that to matter, the
 * limit has to move into Postgres or a shared cache, and the honest place to notice
 * that is this comment.
 *
 * Nothing here talks to the database or to SvelteKit, so it is an ordinary object
 * the tests drive with an explicit clock.
 */

/**
 * @typedef {object} RateLimitVerdict
 * @property {boolean} allowed - Whether another attempt may be made right now.
 * @property {number} retryAfter - Whole seconds until it may, `0` when allowed.
 */

export class RateLimiter {
	/** @type {Map<string, number[]>} Key → timestamps of the attempts still in window. */
	#attempts = new Map();
	#limit;
	#windowMs;
	#maxKeys;

	/**
	 * @param {object} options
	 * @param {number} options.limit - Attempts allowed per window.
	 * @param {number} options.windowMs - Length of the window in milliseconds.
	 * @param {number} [options.maxKeys] - Cap on tracked keys before a sweep; the map
	 *   is keyed by client-supplied values (IP, email), so it must not grow forever.
	 */
	constructor({ limit, windowMs, maxKeys = 10_000 }) {
		this.#limit = limit;
		this.#windowMs = windowMs;
		this.#maxKeys = maxKeys;
	}

	/**
	 * How many keys are being tracked — the number {@link #sweep} exists to bound.
	 * Worth having a name for: it is the one way this object can misbehave in
	 * production, and it is what the tests watch.
	 *
	 * @returns {number}
	 */
	get size() {
		return this.#attempts.size;
	}

	/**
	 * Whether `key` may attempt again, without counting this call as an attempt.
	 *
	 * Separate from {@link record} on purpose: a request that is refused must not
	 * push its own refusal into the window, or a client that keeps retrying would
	 * extend its own lockout indefinitely.
	 *
	 * @param {string} key
	 * @param {number} [now] - Epoch milliseconds; injected by the tests.
	 * @returns {RateLimitVerdict}
	 */
	check(key, now = Date.now()) {
		const recent = this.#recent(key, now);
		if (recent.length < this.#limit) return { allowed: true, retryAfter: 0 };

		const oldest = recent[0];
		const retryAfter = Math.max(1, Math.ceil((oldest + this.#windowMs - now) / 1000));
		return { allowed: false, retryAfter };
	}

	/**
	 * Counts one attempt against `key`.
	 *
	 * @param {string} key
	 * @param {number} [now]
	 * @returns {void}
	 */
	record(key, now = Date.now()) {
		const recent = this.#recent(key, now);
		recent.push(now);
		this.#attempts.set(key, recent);

		if (this.#attempts.size > this.#maxKeys) this.#sweep(now);
	}

	/**
	 * Forgets `key` — what a successful login does, so that one bad guess before the
	 * right password does not count against the next hour.
	 *
	 * @param {string} key
	 * @returns {void}
	 */
	clear(key) {
		this.#attempts.delete(key);
	}

	/**
	 * The attempts of `key` that are still inside the window.
	 *
	 * @param {string} key
	 * @param {number} now
	 * @returns {number[]}
	 */
	#recent(key, now) {
		const cutoff = now - this.#windowMs;
		return (this.#attempts.get(key) ?? []).filter((at) => at > cutoff);
	}

	/**
	 * Drops keys whose attempts have all aged out.
	 *
	 * @param {number} now
	 * @returns {void}
	 */
	#sweep(now) {
		const cutoff = now - this.#windowMs;
		for (const [key, times] of this.#attempts) {
			if (times.every((at) => at <= cutoff)) this.#attempts.delete(key);
		}
	}
}

/** Attempts per key per window, as specified in #16. */
export const LOGIN_ATTEMPT_LIMIT = 10;

/** 15 minutes. */
export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

/**
 * The limiter the login action uses, shared by every request this process serves.
 *
 * Counted per IP *and* per email address: the IP key stops one host from working
 * through a list of addresses, the email key stops a botnet from working through a
 * list of passwords for one account.
 */
export const loginLimiter = new RateLimiter({
	limit: LOGIN_ATTEMPT_LIMIT,
	windowMs: LOGIN_ATTEMPT_WINDOW_MS
});
