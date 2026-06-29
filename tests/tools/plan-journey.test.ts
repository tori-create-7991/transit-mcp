import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { createPlanJourneyTool } from "../../src/mcp/tools/plan-journey";
import type { TransitClient } from "../../src/transit/client";

type GetResponse = {
	data?: unknown;
	error?: unknown;
	response?: { status: number };
};

/**
 * Builds a TransitClient mock that dispatches by path so a single test can
 * stub /places/suggest (resolve from/to) and /guidance/plan separately.
 */
function makeRouter(handlers: Record<string, () => GetResponse>): {
	client: TransitClient;
	get: ReturnType<typeof vi.fn>;
} {
	const get = vi.fn(async (path: string, _init?: unknown) => {
		const h = handlers[path];
		if (!h) {
			return { error: { code: "no_stub" }, response: { status: 500 } };
		}
		return h();
	});
	return { client: { GET: get } as unknown as TransitClient, get };
}

const PLACES_HIT = (name: string, id: string) => ({
	data: {
		places: [
			{
				id,
				endpoint: id,
				name,
				kind: "station",
				source: "transit",
				lat: 35.658,
				lon: 139.7016,
				score: 1,
				weight: 1,
			},
		],
		coverage: { sources: ["transit"], kinds: ["station"], notices: [] },
	},
	response: { status: 200 },
});

const PLACES_MISS = (): GetResponse => ({
	data: {
		places: [],
		coverage: { sources: [], kinds: [], notices: [] },
	},
	response: { status: 200 },
});

const GUIDANCE_FIXTURE = {
	date: "20260627",
	type: "departure" as const,
	timezone: "Asia/Tokyo",
	from: { id: "JR-E:Shibuya", name: "渋谷" },
	to: { id: "JR-E:Tokyo", name: "東京" },
	live: {
		mode: "manual",
		tracking: "none",
		refreshAfterSecs: 60,
		anchorSecs: 0,
	},
	osm: { status: "notApplicable" },
	coverage: { feeds: [], transitModes: [], notices: [] },
	decision: { strategy: "balanced", primaryFactors: [], tradeoffs: [] },
	options: [
		{
			id: "opt1",
			rank: 1,
			score: 1,
			recommended: true,
			selectedFor: "balanced",
			confidence: "high",
			metrics: {
				durationSecs: 1680,
				transitSecs: 1600,
				walkSecs: 0,
				waitSecs: 80,
				transferCount: 0,
				headwayLegCount: 0,
			},
			load: {
				overall: "low",
				walking: "low",
				waiting: "low",
				transfer: "low",
				uncertainty: "low",
			},
			decisionFactors: [],
			journey: {
				departureSecs: 30_000,
				arrivalSecs: 31_680,
				durationSecs: 1680,
				transferCount: 0,
				legs: [
					{
						kind: "transit",
						routeName: "JR 山手線",
						mode: "rail",
						headsign: "東京方面",
						tripId: "t1",
						from: { id: "JR-E:Shibuya", name: "渋谷" },
						to: { id: "JR-E:Tokyo", name: "東京" },
						departureSecs: 30_000,
						arrivalSecs: 31_680,
						headwayBased: false,
					},
				],
			},
		},
		{
			id: "opt2",
			rank: 2,
			score: 0.8,
			recommended: false,
			selectedFor: "fastest",
			confidence: "medium",
			metrics: {
				durationSecs: 2400,
				transitSecs: 2300,
				walkSecs: 0,
				waitSecs: 100,
				transferCount: 1,
				headwayLegCount: 0,
			},
			load: {
				overall: "low",
				walking: "low",
				waiting: "low",
				transfer: "low",
				uncertainty: "low",
			},
			decisionFactors: [],
			journey: {
				departureSecs: 30_000,
				arrivalSecs: 32_400,
				durationSecs: 2400,
				transferCount: 1,
				legs: [],
			},
		},
	],
};

describe("plan_journey tool", () => {
	it("resolves free-text from/to and returns summary + options", async () => {
		const { client } = makeRouter({
			"/api/v1/places/suggest": () => PLACES_HIT("渋谷", "JR-E:Shibuya"),
			"/api/v1/guidance/plan": () => ({
				data: GUIDANCE_FIXTURE,
				response: { status: 200 },
			}),
		});
		const handler = createPlanJourneyTool(client);
		const out = await handler({ from: "渋谷", to: "東京" }, "en");
		expect(out.content[0]!.text).toMatch(/2 routes/);
		expect(out.content[0]!.text).toMatch(/28 min/); // 1680 sec = 28 min
		expect(out.content[0]!.text).toMatch(/JR 山手線/);
		const sc = out.structuredContent as {
			summary: string;
			options: unknown[];
			_meta: { ui: { resourceUri: string } };
		};
		expect(sc.options).toHaveLength(2);
		expect(sc._meta.ui.resourceUri).toBe("");
	});

	it("emits ja summary when lang=ja", async () => {
		const { client } = makeRouter({
			"/api/v1/places/suggest": () => PLACES_HIT("渋谷", "JR-E:Shibuya"),
			"/api/v1/guidance/plan": () => ({
				data: GUIDANCE_FIXTURE,
				response: { status: 200 },
			}),
		});
		const handler = createPlanJourneyTool(client);
		const out = await handler({ from: "渋谷", to: "東京" }, "ja");
		expect(out.content[0]!.text).toContain("件の経路");
		expect(out.content[0]!.text).toContain("28 分");
	});

	it("passes geo:lat,lon endpoints through unchanged (no resolve call)", async () => {
		const { client, get } = makeRouter({
			"/api/v1/guidance/plan": () => ({
				data: GUIDANCE_FIXTURE,
				response: { status: 200 },
			}),
		});
		const handler = createPlanJourneyTool(client);
		await handler({ from: "geo:35.66,139.70", to: "JR-E:Tokyo" }, "en");
		// Only the guidance/plan call should have been issued.
		expect(get).toHaveBeenCalledTimes(1);
		const call = get.mock.calls[0]!;
		expect(call[0]).toBe("/api/v1/guidance/plan");
		const params = call[1] as
			| { params?: { query?: { from?: string; to?: string } } }
			| undefined;
		expect(params?.params?.query?.from).toBe("geo:35.66,139.70");
		expect(params?.params?.query?.to).toBe("JR-E:Tokyo");
	});

	it("fails with place-not-found when suggest returns 0 results", async () => {
		const { client } = makeRouter({
			"/api/v1/places/suggest": () => PLACES_MISS(),
		});
		const handler = createPlanJourneyTool(client);
		await expect(
			handler({ from: "存在しない地名", to: "東京" }, "ja"),
		).rejects.toBeInstanceOf(McpError);
	});

	it("returns a no-route summary when guidance returns empty options", async () => {
		const { client } = makeRouter({
			"/api/v1/places/suggest": () => PLACES_HIT("渋谷", "JR-E:Shibuya"),
			"/api/v1/guidance/plan": () => ({
				data: { ...GUIDANCE_FIXTURE, options: [] },
				response: { status: 200 },
			}),
		});
		const handler = createPlanJourneyTool(client);
		const out = await handler({ from: "渋谷", to: "東京" }, "en");
		expect(out.content[0]!.text).toMatch(/No transit route/);
	});
});
