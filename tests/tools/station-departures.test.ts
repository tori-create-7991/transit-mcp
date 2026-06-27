import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { createStationDeparturesTool } from "../../src/mcp/tools/station-departures";
import type { TransitClient } from "../../src/transit/client";

function makeClient(
	respond: () => {
		data?: unknown;
		error?: unknown;
		response?: { status: number };
	},
): { client: TransitClient; get: ReturnType<typeof vi.fn> } {
	const get = vi.fn(async (_path: string, _init?: unknown) => respond());
	return { client: { GET: get } as unknown as TransitClient, get };
}

const STATION_FIXTURE = {
	stationId: "JR-E:Shibuya",
	date: "20260627",
	timezone: "Asia/Tokyo",
	departures: [
		{
			routeName: "山手線",
			mode: "rail",
			headsign: "外回り 新宿方面",
			tripId: "t1",
			stopId: "JR-E:Shibuya:1",
			departureSecs: 30_000,
			headwayBased: false,
		},
		{
			routeName: "湘南新宿ライン",
			mode: "rail",
			headsign: "大宮方面",
			tripId: "t2",
			stopId: "JR-E:Shibuya:3",
			departureSecs: 30_300,
			headwayBased: false,
		},
	],
};

describe("station_departures tool", () => {
	it("returns localized summary and structured departures", async () => {
		const { client } = makeClient(() => ({
			data: STATION_FIXTURE,
			response: { status: 200 },
		}));
		const handler = createStationDeparturesTool(client);
		const out = await handler({ stationId: "JR-E:Shibuya" }, "ja");
		expect(out.content[0]!.text).toContain("2");
		const sc = out.structuredContent as {
			station: { id: string };
			departures: { routeName: string; departSec: number }[];
		};
		expect(sc.station.id).toBe("JR-E:Shibuya");
		expect(sc.departures).toHaveLength(2);
		expect(sc.departures[0]!.routeName).toBe("山手線");
		expect(sc.departures[0]!.departSec).toBe(30_000);
	});

	it("converts ISO `when` into YYYYMMDD date and HH:MM:SS time params", async () => {
		const { client, get } = makeClient(() => ({
			data: { ...STATION_FIXTURE, departures: [] },
			response: { status: 200 },
		}));
		const handler = createStationDeparturesTool(client);
		await handler(
			{
				stationId: "JR-E:Shibuya",
				when: "2026-06-27T09:30:00Z",
				limit: 5,
			},
			"ja",
		);
		const firstCall = get.mock.calls[0];
		const params = firstCall?.[1] as
			| {
					params?: { query?: { date?: string; time?: string; limit?: number } };
			  }
			| undefined;
		expect(params?.params?.query?.date).toBe("20260627");
		expect(params?.params?.query?.time).toBe("09:30:00");
		expect(params?.params?.query?.limit).toBe(5);
	});

	it("returns empty-departures summary when API returns no rows", async () => {
		const { client } = makeClient(() => ({
			data: { ...STATION_FIXTURE, departures: [] },
			response: { status: 200 },
		}));
		const handler = createStationDeparturesTool(client);
		const out = await handler({ stationId: "JR-E:Shibuya" }, "en");
		expect(out.content[0]!.text).toMatch(/No departures/);
	});

	it("maps 404 to station-not-found error", async () => {
		const { client } = makeClient(() => ({
			error: { code: "not_found" },
			response: { status: 404 },
		}));
		const handler = createStationDeparturesTool(client);
		await expect(
			handler({ stationId: "MISSING:STATION" }, "ja"),
		).rejects.toThrow(/該当する駅/);
	});

	it("rejects missing stationId with InvalidParams", async () => {
		const { client } = makeClient(() => ({ data: STATION_FIXTURE }));
		const handler = createStationDeparturesTool(client);
		await expect(
			handler({ stationId: "" } as never, "ja"),
		).rejects.toBeInstanceOf(McpError);
	});

	it("clamps limit into [1, 30]", async () => {
		const { client, get } = makeClient(() => ({
			data: { ...STATION_FIXTURE, departures: [] },
			response: { status: 200 },
		}));
		const handler = createStationDeparturesTool(client);
		await handler({ stationId: "JR-E:Shibuya", limit: 99 }, "ja");
		const firstCall = get.mock.calls[0];
		const params = firstCall?.[1] as
			| { params?: { query?: { limit?: number } } }
			| undefined;
		expect(params?.params?.query?.limit).toBe(30);
	});
});
