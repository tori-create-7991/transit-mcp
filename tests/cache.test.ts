import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cachedFetch, cachePolicy } from "../src/transit/cache";

// In-memory Cloudflare Cache API mock.
function makeCacheMock() {
	const store = new Map<string, Response>();
	return {
		store,
		match: vi.fn(async (req: Request) => {
			const key = typeof req === "string" ? req : req.url;
			const hit = store.get(key);
			return hit ? hit.clone() : undefined;
		}),
		put: vi.fn(async (req: Request, resp: Response) => {
			const key = typeof req === "string" ? req : req.url;
			store.set(key, resp.clone());
		}),
	};
}

describe("cachePolicy", () => {
	it("returns 1 day TTL for /places/suggest", () => {
		const p = cachePolicy("/api/v1/places/suggest");
		expect(p.maxAge).toBe(86_400);
		expect(p.swr).toBe(86_400);
	});

	it("returns 1 day TTL for /locations/suggest", () => {
		const p = cachePolicy("/api/v1/locations/suggest");
		expect(p.maxAge).toBe(86_400);
		expect(p.swr).toBe(86_400);
	});

	it("returns 10s TTL with 30s SWR for /stations/{id}/departures", () => {
		const p = cachePolicy("/api/v1/stations/JR-E.JY01/departures");
		expect(p.maxAge).toBe(10);
		expect(p.swr).toBe(30);
	});

	it("returns 1 day TTL for /stations/{id} (without /departures)", () => {
		const p = cachePolicy("/api/v1/stations/JR-E.JY01");
		expect(p.maxAge).toBe(86_400);
		expect(p.swr).toBe(86_400);
	});

	it("returns 60s TTL with 5min SWR for /plan", () => {
		const p = cachePolicy("/api/v1/plan");
		expect(p.maxAge).toBe(60);
		expect(p.swr).toBe(300);
	});

	it("returns 60s TTL with 5min SWR for /guidance/plan", () => {
		const p = cachePolicy("/api/v1/guidance/plan");
		expect(p.maxAge).toBe(60);
		expect(p.swr).toBe(300);
	});

	it("returns 1 hour TTL with 1 day SWR for /feeds", () => {
		const p = cachePolicy("/api/v1/feeds");
		expect(p.maxAge).toBe(3_600);
		expect(p.swr).toBe(86_400);
	});

	it("returns 1 hour TTL with 1 day SWR for /operators", () => {
		const p = cachePolicy("/api/v1/operators");
		expect(p.maxAge).toBe(3_600);
		expect(p.swr).toBe(86_400);
	});

	it("returns 6 hour TTL with 1 day SWR for /map/3d-scene", () => {
		const p = cachePolicy("/api/v1/map/3d-scene");
		expect(p.maxAge).toBe(21_600);
		expect(p.swr).toBe(86_400);
	});

	it("returns no-cache (maxAge=0) for unmatched paths", () => {
		const p = cachePolicy("/api/v1/unknown");
		expect(p.maxAge).toBe(0);
		expect(p.swr).toBe(0);
	});

	it("differentiates /stations/{id}/departures from /stations/{id}", () => {
		const a = cachePolicy("/api/v1/stations/abc/departures");
		const b = cachePolicy("/api/v1/stations/abc");
		expect(a.maxAge).toBe(10);
		expect(b.maxAge).toBe(86_400);
	});
});

describe("cachedFetch", () => {
	let cacheMock: ReturnType<typeof makeCacheMock>;
	let fetchSpy: ReturnType<typeof vi.fn>;
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		cacheMock = makeCacheMock();
		vi.stubGlobal("caches", { default: cacheMock });

		fetchSpy = vi.fn(
			async (_input: RequestInfo, _init?: RequestInit) =>
				new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
		);
		originalFetch = globalThis.fetch;
		globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("returns cached response on hit without calling fetch", async () => {
		const url = "https://api.transit.ls8h.com/api/v1/feeds";
		const cached = new Response("cached-body", {
			status: 200,
			headers: { "content-type": "application/json" },
		});
		cacheMock.store.set(url, cached);

		const res = await cachedFetch(url);
		const body = await res.text();

		expect(body).toBe("cached-body");
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(cacheMock.match).toHaveBeenCalledOnce();
	});

	it("calls fetch on miss and stores response in cache", async () => {
		const url = "https://api.transit.ls8h.com/api/v1/feeds";

		const res = await cachedFetch(url);

		expect(res.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledOnce();
		expect(cacheMock.put).toHaveBeenCalledOnce();
		expect(cacheMock.store.has(url)).toBe(true);
	});

	it("sets Cache-Control header with maxAge and SWR on cached put", async () => {
		const url = "https://api.transit.ls8h.com/api/v1/plan";

		await cachedFetch(url);

		expect(cacheMock.put).toHaveBeenCalledOnce();
		const putCall = cacheMock.put.mock.calls[0];
		const storedResponse = putCall?.[1] as Response;
		const cc = storedResponse.headers.get("cache-control");
		expect(cc).toBe("public, max-age=60, stale-while-revalidate=300");
	});

	it("does not cache and uses no-cache header for unmatched paths", async () => {
		const url = "https://api.transit.ls8h.com/api/v1/unknown";

		const res = await cachedFetch(url);

		expect(res.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledOnce();
		// Unmatched paths should not be put into cache (no policy = bypass).
		expect(cacheMock.put).not.toHaveBeenCalled();
	});

	it("does not cache non-2xx responses", async () => {
		fetchSpy.mockResolvedValueOnce(
			new Response("server error", { status: 500 }),
		);
		const url = "https://api.transit.ls8h.com/api/v1/feeds";

		const res = await cachedFetch(url);

		expect(res.status).toBe(500);
		expect(cacheMock.put).not.toHaveBeenCalled();
	});

	it("derives policy from URL pathname, not full URL", async () => {
		const url =
			"https://api.transit.ls8h.com/api/v1/stations/abc/departures?when=2026-06-27T10:00:00Z";

		await cachedFetch(url);

		const putCall = cacheMock.put.mock.calls[0];
		const storedResponse = putCall?.[1] as Response;
		const cc = storedResponse.headers.get("cache-control");
		expect(cc).toBe("public, max-age=10, stale-while-revalidate=30");
	});
});
