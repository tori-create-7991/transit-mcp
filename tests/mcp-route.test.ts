import { describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import app from "../src/index";

function makeEnv(): Env {
	return {
		UI_CACHE: {
			get: vi.fn(async () => null),
			put: vi.fn(async () => undefined),
		} as unknown as KVNamespace,
		TRANSIT_API_BASE: "https://api.example.test",
		MAP_STYLE_URL: "https://tiles.example.test/style.json",
		MAP_STYLE_URL_DARK: "https://tiles.example.test/dark-style.json",
		DEFAULT_LANG: "ja",
	};
}

const BASE = "https://transit-mcp.example.test";

describe("/mcp route", () => {
	it("rejects GET with 405 so clients do not open a reconnecting SSE stream", async () => {
		const res = await app.request(
			`${BASE}/mcp`,
			{ method: "GET", headers: { accept: "text/event-stream" } },
			makeEnv(),
		);

		expect(res.status).toBe(405);
		expect(res.headers.get("allow")).toBe("POST");
	});

	it("still answers POST initialize with 200", async () => {
		const res = await app.request(
			`${BASE}/mcp`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json, text/event-stream",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "initialize",
					params: {
						protocolVersion: "2025-06-18",
						capabilities: {},
						clientInfo: { name: "test", version: "0" },
					},
				}),
			},
			makeEnv(),
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			result: { serverInfo: { name: string } };
		};
		expect(body.result.serverInfo.name).toBe("transit-mcp");
	});
});
