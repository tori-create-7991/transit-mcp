// Cloudflare Cache API wrapper for the Transit API.
// Maps URL pathnames to (maxAge, stale-while-revalidate) TTLs and provides a
// drop-in `cachedFetch` for `openapi-fetch`'s `fetch` option.

const DAY = 86_400;
const HOUR = 3_600;
const MINUTE = 60;

export interface CachePolicy {
	/** Cache freshness window in seconds. 0 means do not cache. */
	maxAge: number;
	/** Stale-while-revalidate window in seconds. */
	swr: number;
}

const NO_CACHE: CachePolicy = { maxAge: 0, swr: 0 };

/**
 * Resolve cache policy from a request path (with or without query string).
 * The order below matters: more specific patterns must come before broader
 * ones. In particular, `/stations/{id}/departures` must be tested before
 * `/stations/{id}`.
 */
export function cachePolicy(path: string): CachePolicy {
	// Strip query string and trailing slash for matching.
	const p = path.split("?")[0]?.replace(/\/$/, "") ?? "";

	// Order-sensitive: most specific first.
	if (/\/stations\/[^/]+\/departures$/.test(p)) {
		return { maxAge: 10, swr: 30 };
	}
	if (/\/stations\/[^/]+$/.test(p)) {
		return { maxAge: DAY, swr: DAY };
	}
	if (p.endsWith("/places/suggest") || p.endsWith("/locations/suggest")) {
		return { maxAge: DAY, swr: DAY };
	}
	if (p.endsWith("/guidance/plan") || p.endsWith("/plan")) {
		// Don't cache journey planner responses: repeated `via=` array params
		// don't survive cleanly through Cloudflare cache normalization, and
		// time-sensitive `when` queries shouldn't share cache entries.
		return NO_CACHE;
	}
	if (p.endsWith("/feeds") || p.endsWith("/operators")) {
		return { maxAge: HOUR, swr: DAY };
	}
	if (p.endsWith("/map/3d-scene")) {
		return { maxAge: 6 * HOUR, swr: DAY };
	}

	return NO_CACHE;
}

function buildCacheControl(policy: CachePolicy): string {
	return `public, max-age=${policy.maxAge}, stale-while-revalidate=${policy.swr}`;
}

/**
 * Treat status / fetch error as transient. Per design.md §11 we retry
 * exactly once with a short backoff before surfacing the failure.
 */
function isTransientStatus(status: number): boolean {
	return status >= 500 || status === 429;
}

const RETRY_BACKOFF_MS = 200;

async function fetchWithRetry(request: Request): Promise<Response> {
	let attempt = 0;
	let lastError: unknown;
	while (attempt < 2) {
		try {
			const res = await fetch(request);
			if (attempt === 0 && isTransientStatus(res.status)) {
				attempt += 1;
				await sleep(RETRY_BACKOFF_MS);
				continue;
			}
			return res;
		} catch (err) {
			lastError = err;
			if (attempt === 0) {
				attempt += 1;
				await sleep(RETRY_BACKOFF_MS);
				continue;
			}
			break;
		}
	}
	// Both attempts errored at the network level. Surface a synthetic 503 so
	// `openapi-fetch` reports `{ error, response: { status: 503 } }` and the
	// tool layer can map it to a localized INTERNAL_ERROR per shared.ts.
	if (lastError !== undefined) {
		return new Response(JSON.stringify({ error: "network_error" }), {
			status: 503,
			headers: { "content-type": "application/json" },
		});
	}
	return fetch(request);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch wrapper that consults Cloudflare's `caches.default` for GET requests
 * matching a known cache policy. Suitable as the `fetch` option for
 * `openapi-fetch`.
 *
 * Behavior:
 *   - Unmatched paths (policy.maxAge === 0): bypass the cache entirely.
 *   - GET requests with a policy: serve from cache on hit; on miss, fetch
 *     upstream, attach a `Cache-Control` header derived from the policy, and
 *     store a clone in `caches.default`.
 *   - Non-2xx responses are never stored.
 */
export async function cachedFetch(
	input: RequestInfo,
	init?: RequestInit,
): Promise<Response> {
	const request =
		input instanceof Request
			? init
				? new Request(input, init)
				: input
			: new Request(input, init);

	// Cache API only stores GET responses. POST/PUT/etc. are never retried
	// because they are not idempotent.
	if (request.method !== "GET") {
		return fetch(request);
	}

	const url = new URL(request.url);
	const policy = cachePolicy(url.pathname);

	// Unmatched paths bypass the cache and do not set a Cache-Control header.
	// They still benefit from the 1-shot retry for transient upstream failures.
	if (policy.maxAge === 0) {
		return fetchWithRetry(request);
	}

	// Cloudflare runtime only: `caches.default` exists on Workers. In Node
	// tests this is supplied via `vi.stubGlobal`. If absent (e.g. running in a
	// bare Node script), fall through to a plain fetch (with retry).
	const cache = (globalThis as { caches?: { default?: Cache } }).caches
		?.default;
	if (!cache) {
		return fetchWithRetry(request);
	}

	const hit = await cache.match(request);
	if (hit) {
		return hit;
	}

	const response = await fetchWithRetry(request);
	if (!response.ok) {
		return response;
	}

	// Clone response and inject Cache-Control before storing so Cloudflare
	// honours the TTL and SWR window at the edge.
	const body = await response.clone().arrayBuffer();
	const headers = new Headers(response.headers);
	headers.set("cache-control", buildCacheControl(policy));
	const cacheable = new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});

	await cache.put(request, cacheable.clone());
	return cacheable;
}
