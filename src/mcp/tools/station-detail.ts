/**
 * `station_detail` — station metadata, platforms, and serving routes.
 *
 * Wraps `GET /api/v1/stations/{id}`. The 404 case is mapped to a
 * localized "station not found" InvalidParams so the LLM can re-prompt
 * the user rather than treat it as a server failure.
 */

import type { Lang } from "../../i18n.js";
import { t } from "../../i18n.js";
import type { TransitClient } from "../../transit/client.js";
import {
	assertString,
	type JsonSchema,
	mapUpstreamError,
	resolveLang,
	type ToolFactory,
	type ToolResult,
} from "./shared.js";

export type StationDetailArgs = {
	stationId: string;
	lang?: Lang;
};

export type StationDetailRoute = {
	id: string;
	name: string;
	color?: string;
	operatorId?: string;
};

export type StationDetailPlatform = {
	name: string;
	routes: string[];
};

export const STATION_DETAIL_NAME = "station_detail";

export const STATION_DETAIL_DESCRIPTION =
	"Get detailed information about a Japanese transit station: coordinates, platforms, and serving routes. Accepts a feed-qualified station id (`feedId:stopId`) obtained from search_places.";

export const STATION_DETAIL_INPUT_SCHEMA: JsonSchema = {
	type: "object",
	properties: {
		stationId: {
			type: "string",
			minLength: 1,
			description: "Feed-qualified station id, e.g. `JR-E:Shibuya`.",
		},
		lang: {
			type: "string",
			enum: ["ja", "en"],
			description: "Summary language; defaults to server DEFAULT_LANG.",
		},
	},
	required: ["stationId"],
	additionalProperties: false,
};

export function validateStationDetail(raw: unknown): StationDetailArgs {
	const obj = (raw ?? {}) as Record<string, unknown>;
	return {
		stationId: typeof obj.stationId === "string" ? obj.stationId.trim() : "",
		lang: resolveLang(obj.lang, "ja"),
	};
}

export const createStationDetailTool: ToolFactory<StationDetailArgs> =
	(client) =>
	async (args, lang): Promise<ToolResult> => {
		const stationId = assertString(args.stationId, "stationId", lang);

		const { data, error, response } = await client.GET(
			"/api/v1/stations/{id}",
			{
				params: { path: { id: stationId } },
			},
		);

		if (error || !data) {
			throw mapUpstreamError(response?.status, lang, "error_station_not_found");
		}

		const station = {
			id: data.id,
			name: data.name,
			lat: data.lat,
			lon: data.lon,
		};

		// The raw `routes` array describes routes serving the station; the API
		// does not give each route a stable id, so we synthesize one from the
		// feed prefix and route name to keep ids deterministic for callers.
		const routes: StationDetailRoute[] = (data.routes ?? []).map((r) => {
			const out: StationDetailRoute = {
				id: `${data.feedId}:${r.name}`,
				name: r.name,
			};
			if (r.color !== undefined) out.color = r.color;
			return out;
		});

		// The departure board doesn't tie platforms to specific routes, so we
		// emit each platform with an empty routes array. Phase 5 can enrich
		// this from timetable/route metadata once we cache it.
		const platforms: StationDetailPlatform[] = (data.platforms ?? []).map(
			(p) => ({ name: p.name, routes: [] }),
		);

		const summary = t("station_summary", lang, {
			name: station.name,
			routeCount: routes.length,
			platformCount: platforms.length,
		});

		return {
			content: [{ type: "text", text: summary }],
			structuredContent: { station, platforms, routes },
		};
	};
