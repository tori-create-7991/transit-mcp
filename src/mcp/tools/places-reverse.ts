import type { Lang } from "../../i18n.js";
import { t } from "../../i18n.js";
import {
	clampInt,
	type JsonSchema,
	mapUpstreamError,
	resolveLang,
	type ToolFactory,
	type ToolResult,
} from "./shared.js";

export type PlacesReverseArgs = {
	lat: number;
	lon: number;
	limit?: number;
	radiusMeters?: number;
	lang?: Lang;
};

export type ReversePlace = {
	id: string;
	name: string;
	kind: "station" | "stop" | "address" | "poi";
	lat: number;
	lon: number;
	distanceMeters: number;
};

export const PLACES_REVERSE_NAME = "places_reverse";
export const PLACES_REVERSE_DESCRIPTION =
	"Find transit stations / stops / addresses near a geographic coordinate. Use after a user taps the map or shares their location. Returns up to `limit` places sorted by distance.";

export const PLACES_REVERSE_INPUT_SCHEMA: JsonSchema = {
	type: "object",
	properties: {
		lat: { type: "number", minimum: -90, maximum: 90 },
		lon: { type: "number", minimum: -180, maximum: 180 },
		limit: { type: "integer", minimum: 1, maximum: 10, default: 5 },
		radiusMeters: { type: "number", minimum: 1, maximum: 500, default: 500 },
		lang: { type: "string", enum: ["ja", "en"] },
	},
	required: ["lat", "lon"],
	additionalProperties: false,
};

function mapKind(
	kind: "station" | "stop" | "place" | "address",
): ReversePlace["kind"] {
	return kind === "place" ? "poi" : kind;
}

export function validatePlacesReverse(raw: unknown): PlacesReverseArgs {
	const obj = (raw ?? {}) as Record<string, unknown>;
	const lat = typeof obj.lat === "number" ? obj.lat : NaN;
	const lon = typeof obj.lon === "number" ? obj.lon : NaN;
	const out: PlacesReverseArgs = {
		lat,
		lon,
		lang: resolveLang(obj.lang, "ja"),
	};
	if (typeof obj.limit === "number") out.limit = obj.limit;
	if (typeof obj.radiusMeters === "number") out.radiusMeters = obj.radiusMeters;
	return out;
}

export const createPlacesReverseTool: ToolFactory<PlacesReverseArgs> =
	(client) =>
	async (args, lang): Promise<ToolResult> => {
		if (!Number.isFinite(args.lat) || !Number.isFinite(args.lon)) {
			throw mapUpstreamError(400, lang, "error_place_not_found");
		}
		const limit = clampInt(args.limit, 1, 10, 5);
		// Default wider than the upstream API default so map picks get useful context.
		let radiusMeters = args.radiusMeters ?? 500;
		if (radiusMeters < 1) radiusMeters = 1;
		if (radiusMeters > 500) radiusMeters = 500;

		const { data, error, response } = await client.GET(
			"/api/v1/places/reverse",
			{
				params: {
					query: { lat: args.lat, lon: args.lon, limit, radiusMeters },
				},
			},
		);

		if (error || !data) {
			throw mapUpstreamError(response?.status, lang, "error_place_not_found");
		}

		const places: ReversePlace[] = (data.places ?? []).map((p) => ({
			id: p.endpoint ?? p.id,
			name: p.name,
			kind: mapKind(p.kind),
			lat: p.lat,
			lon: p.lon,
			distanceMeters: Math.round(p.distanceMeters),
		}));

		const summary =
			places.length === 0
				? t("places_reverse_empty", lang)
				: t("places_reverse_summary", lang, { count: places.length });

		return {
			content: [{ type: "text", text: summary }],
			structuredContent: { places },
		};
	};
