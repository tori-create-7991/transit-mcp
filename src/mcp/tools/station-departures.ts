/**
 * `station_departures` — upcoming departures from a station.
 *
 * Wraps `GET /api/v1/stations/{id}/departures`. The Transit API uses
 * `date` (YYYYMMDD) and `time` (HH:MM:SS) query params; this tool accepts
 * a single ISO8601 string and splits it accordingly.
 *
 * Departure rows are flattened into the schema documented in
 * design.md §4.3: `{routeName, headsign, departSec, platform?, status?}`.
 */

import type { Lang } from "../../i18n.js";
import { t } from "../../i18n.js";
import type { TransitClient } from "../../transit/client.js";
import {
	assertString,
	clampInt,
	isoToDateAndTime,
	type JsonSchema,
	mapUpstreamError,
	resolveLang,
	type ToolFactory,
	type ToolResult,
} from "./shared.js";

export type StationDeparturesArgs = {
	stationId: string;
	when?: string;
	limit?: number;
	lang?: Lang;
};

export type StationDeparture = {
	routeName: string;
	headsign: string;
	departSec: number;
	platform?: string;
	status?: string;
};

export const STATION_DEPARTURES_NAME = "station_departures";

export const STATION_DEPARTURES_DESCRIPTION =
	"Get the next upcoming departures for a Japanese transit station. Returns route name, headsign, and departure time (seconds from service-date midnight in the station's timezone). Accepts a feed-qualified station id from search_places and an optional ISO8601 `when` to query a future time.";

export const STATION_DEPARTURES_INPUT_SCHEMA: JsonSchema = {
	type: "object",
	properties: {
		stationId: {
			type: "string",
			minLength: 1,
			description: "Feed-qualified station id, e.g. `JR-E:Shibuya`.",
		},
		when: {
			type: "string",
			format: "date-time",
			description:
				"Optional ISO8601 timestamp; defaults to the current time at the station.",
		},
		limit: {
			type: "integer",
			minimum: 1,
			maximum: 30,
			default: 12,
			description: "Maximum number of departures to return (1-30).",
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

export function validateStationDepartures(raw: unknown): StationDeparturesArgs {
	const obj = (raw ?? {}) as Record<string, unknown>;
	const out: StationDeparturesArgs = {
		stationId: typeof obj.stationId === "string" ? obj.stationId.trim() : "",
		lang: resolveLang(obj.lang, "ja"),
	};
	if (typeof obj.when === "string") out.when = obj.when;
	if (typeof obj.limit === "number") out.limit = obj.limit;
	return out;
}

export const createStationDeparturesTool: ToolFactory<StationDeparturesArgs> =
	(client) =>
	async (args, lang): Promise<ToolResult> => {
		const stationId = assertString(args.stationId, "stationId", lang);
		const limit = clampInt(args.limit, 1, 30, 12);
		const { date, time } = isoToDateAndTime(args.when);

		const query: Record<string, unknown> = { limit };
		if (date) query.date = date;
		if (time) query.time = time;

		const { data, error, response } = await client.GET(
			"/api/v1/stations/{id}/departures",
			{
				params: { path: { id: stationId }, query },
			},
		);

		if (error || !data) {
			throw mapUpstreamError(response?.status, lang, "error_station_not_found");
		}

		const station = {
			id: data.stationId,
			name: data.stationId, // departures endpoint does not echo a display name
		};

		const departures: StationDeparture[] = (data.departures ?? []).map((d) => ({
			routeName: d.routeName,
			headsign: d.headsign ?? "",
			departSec: d.departureSecs,
		}));

		const summary =
			departures.length === 0
				? t("departures_empty", lang, { name: station.name })
				: t("departures_summary", lang, {
						count: departures.length,
						name: station.name,
					});

		return {
			content: [{ type: "text", text: summary }],
			structuredContent: { station, departures },
		};
	};
