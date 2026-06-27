/**
 * MCP server factory.
 *
 * Creates an `McpServer` instance per request (Cloudflare Workers has no
 * long-lived process, so we keep this cheap and stateless). Tools and
 * resources are registered in Phase 3 / Phase 4 — for the skeleton, this
 * just bootstraps server identity so `tools/list` returns an empty array
 * cleanly.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Env } from "../env.js";

const SERVER_INFO = {
	name: "transit-mcp",
	version: "0.1.0",
} as const;

export function createMcpServer(_env: Env): McpServer {
	const server = new McpServer(SERVER_INFO, {
		capabilities: {
			tools: {},
			resources: {},
		},
	});

	// Tools are registered in Phase 3; resources in Phase 4.
	return server;
}
