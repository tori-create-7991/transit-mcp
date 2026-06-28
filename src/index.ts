/**
 * transit-mcp Cloudflare Workers entry.
 *
 * Routes:
 * - GET  /health  → liveness probe
 * - ALL  /mcp     → MCP Streamable HTTP transport (POST for JSON-RPC, GET
 *                   for SSE streaming, DELETE for session termination)
 * - GET  /ui/plan → iframe UI for `plan_journey` (Phase 4)
 *
 * The MCP server is created per-request in stateless mode. Each request
 * spins up a fresh `WebStandardStreamableHTTPServerTransport`, connects
 * it to a new `McpServer`, and lets the transport delegate to the
 * registered request handlers.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import type { Env } from "./env.js";
import { renderUiHtml } from "./mcp/resources/ui-html.js";
import { createMcpServer } from "./mcp/server.js";
import { getAttributions } from "./transit/attribution.js";
import type { PlanData } from "./ui/types.js";

type HonoEnv = {
	Bindings: Env;
};

const app = new Hono<HonoEnv>();

app.get("/health", (c) => {
	return c.json({ status: "ok", service: "transit-mcp" });
});

app.all("/mcp", async (c) => {
	const host = new URL(c.req.url).origin;
	const server = createMcpServer(c.env, host);
	// Stateless mode: omit `sessionIdGenerator` entirely (passing `undefined`
	// is rejected by `exactOptionalPropertyTypes`).
	const transport = new WebStandardStreamableHTTPServerTransport({
		// Return JSON responses instead of SSE streams for simple POSTs.
		enableJsonResponse: true,
	});

	await server.connect(transport);

	// Debug: clone the request body and log initialize bodies so we can
	// inspect what each client advertises (e.g. does ChatGPT include
	// the MCP Apps UI extension in clientCapabilities?). Cheap to enable
	// short-term; remove once Apps SDK debugging is done.
	try {
		const rawReq = c.req.raw;
		const ua = rawReq.headers.get("user-agent") ?? "";
		if (rawReq.method === "POST" && /chatgpt|openai/i.test(ua)) {
			const cloned = rawReq.clone();
			try {
				const body = await cloned.text();
				console.log(
					JSON.stringify({
						debug: "chatgpt-init",
						ua,
						body: body.slice(0, 4000),
					}),
				);
			} catch {
				/* ignore */
			}
		}
		return await transport.handleRequest(rawReq);
	} finally {
		// Per-request transports must be closed to release resources.
		await transport.close().catch(() => {
			/* ignore */
		});
	}
});

/**
 * Decode the base64url-encoded plan payload from a `?d=` param.
 * Returns null on any decode failure so the caller can 404 cleanly.
 */
function decodeInlinePayload(b64url: string): PlanData | null {
	try {
		const padded =
			b64url.replace(/-/g, "+").replace(/_/g, "/") +
			"=".repeat((4 - (b64url.length % 4)) % 4);
		const binary = atob(padded);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		const json = new TextDecoder().decode(bytes);
		return JSON.parse(json) as PlanData;
	} catch {
		return null;
	}
}

app.get("/ui/plan", async (c) => {
	const url = new URL(c.req.url);
	const langParam = url.searchParams.get("lang");
	const lang: "ja" | "en" =
		langParam === "en" ? "en" : langParam === "ja" ? "ja" : c.env.DEFAULT_LANG;

	let plan: PlanData | null = null;
	const inline = url.searchParams.get("d");
	const cacheKey = url.searchParams.get("k");
	if (inline) {
		plan = decodeInlinePayload(inline);
	} else if (cacheKey) {
		const stored = await c.env.UI_CACHE.get(cacheKey);
		if (stored) {
			try {
				plan = JSON.parse(stored) as PlanData;
			} catch {
				plan = null;
			}
		}
	}

	if (!plan) {
		return c.text("plan payload not found", 404);
	}

	const attribution = await getAttributions(c.env);
	const html = renderUiHtml(
		plan,
		attribution,
		c.env.MAP_STYLE_URL,
		c.env.MAP_STYLE_URL_DARK,
		lang,
	);
	c.header("Content-Type", "text/html; charset=utf-8");
	// Data is inlined in the URL / KV — safe to allow short edge cache.
	c.header("Cache-Control", "public, max-age=3600");
	return c.body(html);
});

export default app;
