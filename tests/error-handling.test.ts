/**
 * Integration coverage for Transit API → MCP error mapping.
 *
 * These cases exercise the full path from `cachedFetch` (the network
 * boundary) through `openapi-fetch` and the tool handlers, so we verify:
 *
 *   1. 404 (e.g. unknown stationId) surfaces as MCP `INVALID_PARAMS` with
 *      a localized "not found" hint.
 *   2. Transient 5xx is retried exactly once by `cachedFetch`; if both
 *      attempts fail the tool throws `INTERNAL_ERROR`.
 *   3. Free-text `plan_journey` whose `places/suggest` returns 0 results
 *      surfaces `INVALID_PARAMS` with a "place not found" hint.
 *
 * Existing tool-level tests stub `TransitClient.GET` directly; these tests
 * complement them by wiring the real openapi-fetch client to a mocked
 * `globalThis.fetch`, catching regressions where retry behavior or
 * response-shape handling diverges from the upstream Transit API.
 */

import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlanJourneyTool } from "../src/mcp/tools/plan-journey";
import { createStationDetailTool } from "../src/mcp/tools/station-detail";
import { transitClient } from "../src/transit/client";

const BASE = "https://api.test.invalid";

type FetchSpy = ReturnType<typeof vi.fn>;

function setupFetch(): FetchSpy {
	const fetchSpy = vi.fn();
	globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
	return fetchSpy;
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("error handling: transit API → MCP", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		// No `caches.default` stubbed: `cachedFetch` falls through to
		// `fetchWithRetry` directly, which is exactly what we want.
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("station_detail: 404 from upstream → INVALID_PARAMS (ja hint)", async () => {
		const fetchSpy = setupFetch();
		fetchSpy.mockResolvedValueOnce(jsonResponse(404, { error: "not_found" }));

		const handler = createStationDetailTool(transitClient(BASE));
		const err = await handler({ stationId: "MISSING:STATION" }, "ja").catch(
			(e) => e,
		);

		expect(err).toBeInstanceOf(McpError);
		const mcp = err as McpError;
		expect(mcp.code).toBe(ErrorCode.InvalidParams);
		expect(mcp.message).toMatch(/該当する駅/);
		// 404 is not transient: no retry.
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it("station_detail: 404 from upstream → English hint when lang=en", async () => {
		const fetchSpy = setupFetch();
		fetchSpy.mockResolvedValueOnce(jsonResponse(404, { error: "not_found" }));

		const handler = createStationDetailTool(transitClient(BASE));
		const err = await handler({ stationId: "MISSING:STATION" }, "en").catch(
			(e) => e,
		);

		expect(err).toBeInstanceOf(McpError);
		expect((err as McpError).message).toMatch(/Station not found/);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it("station_detail: 5xx retried once, both fail → INTERNAL_ERROR", async () => {
		const fetchSpy = setupFetch();
		fetchSpy.mockResolvedValueOnce(jsonResponse(503, { error: "down" }));
		fetchSpy.mockResolvedValueOnce(jsonResponse(503, { error: "down" }));

		const handler = createStationDetailTool(transitClient(BASE));
		const err = await handler({ stationId: "JR-E:Shibuya" }, "en").catch(
			(e) => e,
		);

		expect(err).toBeInstanceOf(McpError);
		const mcp = err as McpError;
		expect(mcp.code).toBe(ErrorCode.InternalError);
		expect(mcp.message).toMatch(/Upstream API error/);
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("station_detail: 5xx then 200 → success (retry recovers)", async () => {
		const fetchSpy = setupFetch();
		fetchSpy.mockResolvedValueOnce(jsonResponse(503, { error: "down" }));
		fetchSpy.mockResolvedValueOnce(
			jsonResponse(200, {
				id: "JR-E:Shibuya",
				name: "渋谷",
				lat: 35.658,
				lon: 139.7016,
				feedId: "JR-E",
				routes: [{ name: "山手線", mode: "rail" }],
				platforms: [{ id: "p1", name: "1番線" }],
			}),
		);

		const handler = createStationDetailTool(transitClient(BASE));
		const out = await handler({ stationId: "JR-E:Shibuya" }, "ja");

		expect(out.content[0]?.text).toContain("渋谷");
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it("plan_journey: places/suggest returns 0 hits → INVALID_PARAMS", async () => {
		const fetchSpy = setupFetch();
		fetchSpy.mockResolvedValueOnce(
			jsonResponse(200, {
				places: [],
				coverage: { sources: [], kinds: [], notices: [] },
			}),
		);
		fetchSpy.mockResolvedValueOnce(
			jsonResponse(200, {
				places: [],
				coverage: { sources: [], kinds: [], notices: [] },
			}),
		);

		const handler = createPlanJourneyTool(transitClient(BASE));
		const err = await handler(
			{ from: "存在しない地名XYZ", to: "別の存在しない地名" },
			"ja",
		).catch((e) => e);

		expect(err).toBeInstanceOf(McpError);
		const mcp = err as McpError;
		expect(mcp.code).toBe(ErrorCode.InvalidParams);
		expect(mcp.message).toMatch(/該当する地点が見つかりません/);
	});

	it("plan_journey: places/suggest returns 0 hits → English hint when lang=en", async () => {
		const fetchSpy = setupFetch();
		fetchSpy.mockResolvedValueOnce(
			jsonResponse(200, {
				places: [],
				coverage: { sources: [], kinds: [], notices: [] },
			}),
		);
		fetchSpy.mockResolvedValueOnce(
			jsonResponse(200, {
				places: [],
				coverage: { sources: [], kinds: [], notices: [] },
			}),
		);

		const handler = createPlanJourneyTool(transitClient(BASE));
		const err = await handler(
			{ from: "no-such-place-A", to: "no-such-place-B" },
			"en",
		).catch((e) => e);

		expect(err).toBeInstanceOf(McpError);
		expect((err as McpError).message).toMatch(/Place not found/);
	});

	it("plan_journey: guidance 5xx retried once, both fail → INTERNAL_ERROR", async () => {
		const fetchSpy = setupFetch();
		// Two parallel suggest hits (one per endpoint), then 2 attempts on guidance.
		const suggestHit = jsonResponse(200, {
			places: [
				{
					id: "JR-E:Shibuya",
					endpoint: "JR-E:Shibuya",
					name: "渋谷",
					kind: "station",
					source: "transit",
					lat: 35.658,
					lon: 139.7016,
					score: 1,
					weight: 1,
				},
			],
			coverage: { sources: ["transit"], kinds: ["station"], notices: [] },
		});
		fetchSpy.mockImplementation(async (input: RequestInfo) => {
			const url = typeof input === "string" ? input : (input as Request).url;
			if (url.includes("/places/suggest")) {
				return suggestHit.clone();
			}
			if (url.includes("/guidance/plan")) {
				return jsonResponse(503, { error: "down" });
			}
			return jsonResponse(500, { error: "unexpected" });
		});

		const handler = createPlanJourneyTool(transitClient(BASE));
		const err = await handler({ from: "渋谷", to: "東京" }, "en").catch(
			(e) => e,
		);

		expect(err).toBeInstanceOf(McpError);
		const mcp = err as McpError;
		expect(mcp.code).toBe(ErrorCode.InternalError);
		// 2 suggest calls (parallel) + 2 guidance attempts (retry).
		const guidanceCalls = fetchSpy.mock.calls.filter((c) => {
			const url = typeof c[0] === "string" ? c[0] : (c[0] as Request).url;
			return url.includes("/guidance/plan");
		});
		expect(guidanceCalls).toHaveLength(2);
	});
});
