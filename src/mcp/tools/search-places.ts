/**
 * `search_places` — place autocomplete tool.
 *
 * Wraps the Transit API `GET /api/v1/places/suggest` endpoint. Returns
 * up to `limit` candidates (stations, stops, addresses, POIs) and a
 * localized summary line for the LLM to surface to the user.
 *
 * The factory shape (`createSearchPlacesTool(client)`) lets unit tests inject
 * a fake `TransitClient` without touching network or env. The actual server
 * binding happens in `src/mcp/server.ts`.
 */

import type { Lang } from "../../i18n.js";
import { t } from "../../i18n.js";
import type { TransitClient } from "../../transit/client.js";
import {
	clampInt,
	type JsonSchema,
	mapUpstreamError,
	resolveLang,
	type ToolFactory,
	type ToolResult,
} from "./shared.js";

export type SearchPlacesArgs = {
	query: string;
	limit?: number;
	lang?: Lang;
};

export type SearchPlace = {
	id: string;
	name: string;
	kind: "station" | "stop" | "address" | "poi";
	lat?: number;
	lon?: number;
	parentStationId?: string;
};

export const SEARCH_PLACES_NAME = "search_places";

export const SEARCH_PLACES_DESCRIPTION =
	"Search Japanese public transit stations, stops, addresses, and points of interest by name or keyword. Returns up to `limit` candidates with geographic coordinates that can be passed as `from`/`to` to plan_journey.";

export const SEARCH_PLACES_INPUT_SCHEMA: JsonSchema = {
	type: "object",
	properties: {
		query: {
			type: "string",
			minLength: 1,
			description: "Search keyword (station, address, landmark).",
		},
		limit: {
			type: "integer",
			minimum: 1,
			maximum: 20,
			default: 8,
			description: "Maximum number of candidates to return (1-20).",
		},
		lang: {
			type: "string",
			enum: ["ja", "en"],
			description: "Summary language; defaults to server DEFAULT_LANG.",
		},
	},
	required: ["query"],
	additionalProperties: false,
};

function mapKind(
	kind: "station" | "stop" | "place" | "address",
): SearchPlace["kind"] {
	if (kind === "place") return "poi";
	return kind;
}

export function validateSearchPlaces(raw: unknown): SearchPlacesArgs {
	const obj = (raw ?? {}) as Record<string, unknown>;
	const query = typeof obj.query === "string" ? obj.query.trim() : "";
	const out: SearchPlacesArgs = { query, lang: resolveLang(obj.lang, "ja") };
	if (typeof obj.limit === "number") out.limit = obj.limit;
	return out;
}

export const createSearchPlacesTool: ToolFactory<SearchPlacesArgs> =
	(client) =>
	async (args, lang): Promise<ToolResult> => {
		const query = args.query?.trim() ?? "";
		if (query.length === 0) {
			throw mapUpstreamError(400, lang, "error_place_not_found");
		}
		const limit = clampInt(args.limit, 1, 20, 8);

		const { data, error, response } = await client.GET(
			"/api/v1/places/suggest",
			{
				params: { query: { q: query, limit } },
			},
		);

		if (error || !data) {
			throw mapUpstreamError(response?.status, lang, "error_place_not_found");
		}

		const places: SearchPlace[] = (data.places ?? []).map((p) => {
			const out: SearchPlace = {
				id: p.endpoint ?? p.id,
				name: p.name,
				kind: mapKind(p.kind),
			};
			if (p.lat !== undefined) out.lat = p.lat;
			if (p.lon !== undefined) out.lon = p.lon;
			if (p.feedId) out.parentStationId = p.feedId;
			return out;
		});

		const summary =
			places.length === 0
				? t("search_places_empty", lang)
				: t("search_places_summary", lang, { count: places.length });

		return {
			content: [{ type: "text", text: summary }],
			structuredContent: { places },
		};
	};
