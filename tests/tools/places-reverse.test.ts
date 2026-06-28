import { describe, expect, it, vi } from "vitest";
import { createPlacesReverseTool } from "../../src/mcp/tools/places-reverse";
import type { TransitClient } from "../../src/transit/client";

function clientStub(opts: {
	data?: unknown;
	error?: unknown;
	response?: { status: number };
}): TransitClient {
	return {
		GET: vi.fn(async () => ({
			data: opts.data,
			error: opts.error,
			response: opts.response ?? { status: opts.data ? 200 : 400 },
		})),
	} as unknown as TransitClient;
}

describe("places_reverse tool", () => {
	it("returns structured nearby places and rounds distances", async () => {
		const client = clientStub({
			data: {
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
						distanceMeters: 12.6,
					},
					{
						id: "geo:35.6585,139.7015",
						endpoint: "geo:35.6585,139.7015",
						name: "渋谷駅前",
						kind: "place",
						source: "osm",
						lat: 35.6585,
						lon: 139.7015,
						score: 0.9,
						weight: 0.9,
						distanceMeters: 24.2,
					},
				],
				coverage: {
					sources: ["transit", "osm"],
					kinds: ["station"],
					notices: [],
				},
			},
		});
		const handler = createPlacesReverseTool(client);
		const out = await handler(
			{ lat: 35.6581, lon: 139.7017, limit: 2, radiusMeters: 80 },
			"ja",
		);
		expect(out.content[0]!.text).toContain("2");
		expect(out.structuredContent).toBeDefined();
		const places = (out.structuredContent as { places: unknown[] }).places;
		expect(places).toHaveLength(2);
		expect((places[0] as { distanceMeters: number }).distanceMeters).toBe(13);
		expect((places[1] as { kind: string }).kind).toBe("poi");
	});

	it("returns a Japanese empty-result summary instead of throwing", async () => {
		const client = clientStub({
			data: { places: [], coverage: { sources: [], kinds: [], notices: [] } },
		});
		const handler = createPlacesReverseTool(client);
		const out = await handler({ lat: 35.6581, lon: 139.7017 }, "ja");
		expect(out.content[0]!.text).toBe("近隣にスポットが見つかりませんでした");
		expect(
			(out.structuredContent as { places: unknown[] }).places,
		).toHaveLength(0);
	});
});
