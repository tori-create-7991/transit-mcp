/**
 * MCP server factory.
 *
 * Creates an `McpServer` instance per request (Cloudflare Workers has no
 * long-lived process, so we keep this cheap and stateless). The four
 * transit tools (`search_places`, `station_detail`, `station_departures`,
 * `plan_journey`) are registered via the low-level `setRequestHandler`
 * API so we can ship plain JSON Schemas (no Zod runtime dependency) and
 * keep the bundle small for the Worker.
 *
 * Resources for the iframe UI are registered in Phase 4.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	CallToolRequestSchema,
	type CallToolResult,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from "@modelcontextprotocol/sdk/types.js";
import type { Env } from "../env.js";
import { transitClient } from "../transit/client.js";
import {
	createPlanJourneyTool,
	PLAN_JOURNEY_DESCRIPTION,
	PLAN_JOURNEY_INPUT_SCHEMA,
	PLAN_JOURNEY_NAME,
	validatePlanJourney,
} from "./tools/plan-journey.js";
import {
	createSearchPlacesTool,
	SEARCH_PLACES_DESCRIPTION,
	SEARCH_PLACES_INPUT_SCHEMA,
	SEARCH_PLACES_NAME,
	validateSearchPlaces,
} from "./tools/search-places.js";
import { resolveLang } from "./tools/shared.js";
import {
	createStationDeparturesTool,
	STATION_DEPARTURES_DESCRIPTION,
	STATION_DEPARTURES_INPUT_SCHEMA,
	STATION_DEPARTURES_NAME,
	validateStationDepartures,
} from "./tools/station-departures.js";
import {
	createStationDetailTool,
	STATION_DETAIL_DESCRIPTION,
	STATION_DETAIL_INPUT_SCHEMA,
	STATION_DETAIL_NAME,
	validateStationDetail,
} from "./tools/station-detail.js";

const SERVER_INFO = {
	name: "transit-mcp",
	version: "0.1.0",
} as const;

const TOOL_DEFS = [
	{
		name: SEARCH_PLACES_NAME,
		description: SEARCH_PLACES_DESCRIPTION,
		inputSchema: SEARCH_PLACES_INPUT_SCHEMA,
	},
	{
		name: STATION_DETAIL_NAME,
		description: STATION_DETAIL_DESCRIPTION,
		inputSchema: STATION_DETAIL_INPUT_SCHEMA,
	},
	{
		name: STATION_DEPARTURES_NAME,
		description: STATION_DEPARTURES_DESCRIPTION,
		inputSchema: STATION_DEPARTURES_INPUT_SCHEMA,
	},
	{
		name: PLAN_JOURNEY_NAME,
		description: PLAN_JOURNEY_DESCRIPTION,
		inputSchema: PLAN_JOURNEY_INPUT_SCHEMA,
	},
] as const;

export function createMcpServer(env: Env, host: string = ""): McpServer {
	const server = new McpServer(SERVER_INFO, {
		capabilities: {
			tools: {},
			resources: {},
		},
	});

	const defaultLang = resolveLang(env.DEFAULT_LANG, "ja");
	const client = transitClient(env.TRANSIT_API_BASE);
	// `host` is the origin (e.g. `https://transit-mcp.example.workers.dev`)
	// used to build absolute `_meta.ui.resourceUri` URLs. When called
	// outside of an HTTP context (tests, scripts) we leave it blank and the
	// handler falls back to an empty resourceUri.
	const ctx = host ? { host, env } : undefined;

	const handlers = {
		[SEARCH_PLACES_NAME]: createSearchPlacesTool(client),
		[STATION_DETAIL_NAME]: createStationDetailTool(client),
		[STATION_DEPARTURES_NAME]: createStationDeparturesTool(client),
		[PLAN_JOURNEY_NAME]: createPlanJourneyTool(client),
	} as const;

	const validators: Record<string, (raw: unknown) => { lang?: "ja" | "en" }> = {
		[SEARCH_PLACES_NAME]: validateSearchPlaces,
		[STATION_DETAIL_NAME]: validateStationDetail,
		[STATION_DEPARTURES_NAME]: validateStationDepartures,
		[PLAN_JOURNEY_NAME]: validatePlanJourney,
	};

	// Low-level handler registration so we can advertise plain JSON Schemas
	// in tools/list (the high-level McpServer.tool() API requires Zod, which
	// is only a peer dependency of the SDK and not in our runtime deps).
	server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: TOOL_DEFS.map((t) => ({
			name: t.name,
			description: t.description,
			inputSchema: t.inputSchema,
		})),
	}));

	server.server.setRequestHandler(
		CallToolRequestSchema,
		async (req): Promise<CallToolResult> => {
			const { name, arguments: rawArgs } = req.params;
			const handler = handlers[name as keyof typeof handlers];
			const validator = validators[name];
			if (!handler || !validator) {
				throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
			}
			const args = validator(rawArgs);
			const lang = resolveLang(args.lang, defaultLang);
			const result = await handler(args as never, lang, ctx);
			return {
				content: result.content,
				...(result.structuredContent
					? { structuredContent: result.structuredContent }
					: {}),
			};
		},
	);

	return server;
}
