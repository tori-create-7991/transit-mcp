import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { createSearchPlacesTool } from "../../src/mcp/tools/search-places";
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

describe("search_places tool", () => {
	it("returns localized summary and structured places for a hit", async () => {
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
					},
					{
						id: "TYO:Shibuya2",
						endpoint: "TYO:Shibuya2",
						name: "渋谷駅前",
						kind: "stop",
						source: "transit",
						lat: 35.6585,
						lon: 139.7015,
						score: 0.9,
						weight: 0.9,
					},
				],
				coverage: { sources: ["transit"], kinds: ["station"], notices: [] },
			},
		});
		const handler = createSearchPlacesTool(client);
		const out = await handler({ query: "渋谷" }, "ja");
		expect(out.content[0]!.text).toContain("2");
		expect(out.structuredContent).toBeDefined();
		const places = (out.structuredContent as { places: unknown[] }).places;
		expect(places).toHaveLength(2);
		expect((places[0] as { name: string } | undefined)?.name).toBe("渋谷");
	});

	it("uses English summary when lang=en", async () => {
		const client = clientStub({
			data: {
				places: [
					{
						id: "JR-E:Shibuya",
						endpoint: "JR-E:Shibuya",
						name: "Shibuya",
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
		});
		const handler = createSearchPlacesTool(client);
		const out = await handler({ query: "Shibuya" }, "en");
		expect(out.content[0]!.text).toMatch(/places found/);
	});

	it("returns an empty-result summary instead of throwing", async () => {
		const client = clientStub({
			data: { places: [], coverage: { sources: [], kinds: [], notices: [] } },
		});
		const handler = createSearchPlacesTool(client);
		const out = await handler({ query: "blahblah" }, "ja");
		expect(out.content[0]!.text).toContain("見つかりません");
		expect(
			(out.structuredContent as { places: unknown[] }).places,
		).toHaveLength(0);
	});

	it("rejects empty query with InvalidParams", async () => {
		const client = clientStub({ data: { places: [], coverage: {} } });
		const handler = createSearchPlacesTool(client);
		await expect(handler({ query: "" }, "ja")).rejects.toBeInstanceOf(McpError);
	});

	it("maps upstream 400 to InvalidParams", async () => {
		const client = clientStub({
			error: { code: "bad" },
			response: { status: 400 },
		});
		const handler = createSearchPlacesTool(client);
		await expect(handler({ query: "渋谷" }, "ja")).rejects.toBeInstanceOf(
			McpError,
		);
	});

	it("clamps limit into [1, 20]", async () => {
		const get = vi.fn(async (_path: string, _init?: unknown) => ({
			data: { places: [], coverage: { sources: [], kinds: [], notices: [] } },
			error: undefined,
			response: { status: 200 },
		}));
		const client = { GET: get } as unknown as TransitClient;
		const handler = createSearchPlacesTool(client);
		await handler({ query: "x", limit: 999 }, "ja");
		const firstCall = get.mock.calls[0];
		const call = firstCall?.[1] as
			| { params?: { query?: { limit?: number } } }
			| undefined;
		expect(call?.params?.query?.limit).toBe(20);
	});
});
