import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { createStationDetailTool } from "../../src/mcp/tools/station-detail";
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
			response: opts.response ?? { status: opts.data ? 200 : 404 },
		})),
	} as unknown as TransitClient;
}

describe("station_detail tool", () => {
	it("returns station, platforms, routes with ja summary", async () => {
		const client = clientStub({
			data: {
				id: "JR-E:Shibuya",
				name: "渋谷",
				lat: 35.658,
				lon: 139.7016,
				feedId: "JR-E",
				platforms: [
					{ id: "p1", name: "1番線", lat: 35.658, lon: 139.7016 },
					{ id: "p2", name: "2番線", lat: 35.658, lon: 139.7017 },
				],
				routes: [
					{ name: "山手線", mode: "rail", color: "#9acd32" },
					{ name: "湘南新宿ライン", mode: "rail" },
				],
			},
		});
		const handler = createStationDetailTool(client);
		const out = await handler({ stationId: "JR-E:Shibuya" }, "ja");
		expect(out.content[0]!.text).toContain("渋谷");
		expect(out.content[0]!.text).toContain("2");
		const sc = out.structuredContent as {
			station: { id: string };
			platforms: unknown[];
			routes: unknown[];
		};
		expect(sc.station.id).toBe("JR-E:Shibuya");
		expect(sc.platforms).toHaveLength(2);
		expect(sc.routes).toHaveLength(2);
	});

	it("maps 404 to localized 'station not found' error", async () => {
		const client = clientStub({
			error: { code: "not_found" },
			response: { status: 404 },
		});
		const handler = createStationDetailTool(client);
		await expect(
			handler({ stationId: "MISSING:STATION" }, "ja"),
		).rejects.toThrow(/該当する駅/);
	});

	it("maps 404 to English message when lang=en", async () => {
		const client = clientStub({
			error: { code: "not_found" },
			response: { status: 404 },
		});
		const handler = createStationDetailTool(client);
		await expect(
			handler({ stationId: "MISSING:STATION" }, "en"),
		).rejects.toThrow(/Station not found/);
	});

	it("rejects missing stationId with InvalidParams", async () => {
		const client = clientStub({ data: {} });
		const handler = createStationDetailTool(client);
		await expect(
			handler({ stationId: "" } as never, "ja"),
		).rejects.toBeInstanceOf(McpError);
	});
});
