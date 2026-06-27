import { describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { buildUiResourceUri } from "../src/mcp/resources/ui-resource";

type KvLike = {
	get: ReturnType<typeof vi.fn>;
	put: ReturnType<typeof vi.fn>;
};

function makeEnv(kv: KvLike): Env {
	return {
		UI_CACHE: kv as unknown as KVNamespace,
		TRANSIT_API_BASE: "https://api.example.test",
		MAP_STYLE_URL: "https://tiles.example.test/style.json",
		DEFAULT_LANG: "ja",
	};
}

function makeKv(): KvLike {
	return {
		get: vi.fn(async () => null),
		put: vi.fn(async () => undefined),
	};
}

const HOST = "https://transit-mcp.example.workers.dev";

describe("buildUiResourceUri", () => {
	it("inlines small payloads as base64url ?d= and does not touch KV", async () => {
		const kv = makeKv();
		const env = makeEnv(kv);
		const data = { summary: "small", options: [] };
		const uri = await buildUiResourceUri(HOST, data, "ja", env);
		expect(uri.startsWith(`${HOST}/ui/plan?d=`)).toBe(true);
		expect(uri).toContain("&lang=ja");
		// no + / or = padding (base64url)
		const dParam = new URL(uri).searchParams.get("d") ?? "";
		expect(dParam).not.toMatch(/[+/=]/);
		expect(kv.put).not.toHaveBeenCalled();
	});

	it("round-trips JSON via the inline ?d= base64url payload", async () => {
		const kv = makeKv();
		const env = makeEnv(kv);
		const data = {
			summary: "テスト",
			options: [{ durationSec: 600, transfers: 0, legs: [] }],
		};
		const uri = await buildUiResourceUri(HOST, data, "en", env);
		const dParam = new URL(uri).searchParams.get("d");
		expect(dParam).not.toBeNull();
		const padded =
			dParam!.replace(/-/g, "+").replace(/_/g, "/") +
			"=".repeat((4 - (dParam!.length % 4)) % 4);
		const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
		expect(decoded).toEqual(data);
	});

	it("falls back to KV with ?k=<uuid> when payload exceeds 30KB", async () => {
		const kv = makeKv();
		const env = makeEnv(kv);
		// Build a payload whose JSON encoding is well over 30KB.
		const big = { summary: "x".repeat(40_000), options: [] };
		const uri = await buildUiResourceUri(HOST, big, "ja", env);
		expect(uri.startsWith(`${HOST}/ui/plan?k=`)).toBe(true);
		expect(uri).toContain("&lang=ja");
		expect(kv.put).toHaveBeenCalledTimes(1);
		const [key, value, opts] = kv.put.mock.calls[0]!;
		expect(typeof key).toBe("string");
		// stored value is the JSON payload (renderer will re-parse)
		expect(JSON.parse(value as string)).toEqual(big);
		expect((opts as { expirationTtl: number }).expirationTtl).toBe(3600);
		// The ?k= must be the same id we put into KV.
		const kParam = new URL(uri).searchParams.get("k");
		expect(kParam).toBe(key);
	});

	it("uses lang=en when requested", async () => {
		const kv = makeKv();
		const env = makeEnv(kv);
		const uri = await buildUiResourceUri(
			HOST,
			{ summary: "ok", options: [] },
			"en",
			env,
		);
		expect(uri).toContain("&lang=en");
	});
});
