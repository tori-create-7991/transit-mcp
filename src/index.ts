/**
 * transit-mcp Cloudflare Workers entry.
 *
 * Routes:
 * - GET  /health  → liveness probe
 * - ALL  /mcp     → MCP Streamable HTTP transport (POST for JSON-RPC, GET
 *                   for SSE streaming, DELETE for session termination)
 * - GET  /ui/plan → iframe UI for `plan_journey` (stub until Phase 4)
 *
 * The MCP server is created per-request in stateless mode. Each request
 * spins up a fresh `WebStandardStreamableHTTPServerTransport`, connects
 * it to a new `McpServer`, and lets the transport delegate to the
 * registered request handlers.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import type { Env } from "./env.js";
import { createMcpServer } from "./mcp/server.js";

type HonoEnv = {
	Bindings: Env;
};

const app = new Hono<HonoEnv>();

app.get("/health", (c) => {
	return c.json({ status: "ok", service: "transit-mcp" });
});

app.all("/mcp", async (c) => {
	const server = createMcpServer(c.env);
	// Stateless mode: omit `sessionIdGenerator` entirely (passing `undefined`
	// is rejected by `exactOptionalPropertyTypes`).
	const transport = new WebStandardStreamableHTTPServerTransport({
		// Return JSON responses instead of SSE streams for simple POSTs.
		enableJsonResponse: true,
	});

	await server.connect(transport);
	try {
		return await transport.handleRequest(c.req.raw);
	} finally {
		// Per-request transports must be closed to release resources.
		await transport.close().catch(() => {
			/* ignore */
		});
	}
});

app.get("/ui/plan", (c) => {
	return c.html("<h1>plan UI (TBD)</h1>");
});

export default app;
