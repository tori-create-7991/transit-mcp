/**
 * `plan_journey` — Phase 4 wired with iframe UI.
 *
 * Two-step flow:
 *  1. Resolve free-text `from` / `to` via `/api/v1/places/suggest` (top1).
 *     Inputs that already look like API endpoints (`feedId:stopId` or
 *     `geo:lat,lon`) are passed through unchanged.
 *  2. Call `/api/v1/guidance/plan` and flatten the ranked options into the
 *     schema documented in design.md §4.2.
 *
 * When a `RequestContext` (`host` + `env`) is provided by the MCP server,
 * `_meta.ui.resourceUri` is populated via `buildUiResourceUri`. Tests can
 * still call the handler with no context — the resourceUri stays `""` and
 * the existing Phase 3 assertions hold.
 */

import type { Lang } from "../../i18n.js";
import { t } from "../../i18n.js";
import type { TransitClient } from "../../transit/client.js";
import { buildUiResourceUri } from "../resources/ui-resource.js";
import {
	assertString,
	clampInt,
	isoToDateAndTime,
	type JsonSchema,
	mapUpstreamError,
	type RequestContext,
	resolveLang,
	type ToolFactory,
	type ToolResult,
} from "./shared.js";

export type PlanJourneyArgs = {
	from: string;
	to: string;
	via?: string[];
	when?: string;
	mode?: "depart" | "arrive" | "first" | "last";
	maxTransfers?: number;
	avoidModes?: string[];
	allowModes?: string[];
	avoidWalk?: boolean;
	lang?: Lang;
};

export type PlanLeg = {
	mode: string;
	line?: string;
	fromName: string;
	toName: string;
	departSec: number;
	arriveSec: number;
	platform?: string;
};

export type PlanMapPoint = {
	id?: string;
	name?: string;
	lat: number;
	lon: number;
	role?: string;
};

export type PlanMapSegment = {
	kind: string;
	polyline: { lat: number; lon: number }[];
};

export type PlanMapBounds = {
	minLat: number;
	minLon: number;
	maxLat: number;
	maxLon: number;
};

export type PlanMapData = {
	bounds?: PlanMapBounds;
	points: PlanMapPoint[];
	segments: PlanMapSegment[];
};

export type PlanOption = {
	durationSec: number;
	transfers: number;
	fareYen?: number;
	legs: PlanLeg[];
	map?: PlanMapData;
};

export const PLAN_JOURNEY_NAME = "plan_journey";

export const PLAN_JOURNEY_DESCRIPTION =
	'Plan a journey on Japanese public transit between two places. Accepts free-text place names, feed-qualified station ids (`feedId:stopId`), or `geo:lat,lon` for `from`, `to`, and each `via` waypoint. Returns ranked itineraries with duration, transfer count, fare, per-leg details, and map geometry (`option.map.segments[].polyline`). Use `via` to force the route through specific waypoints (max 3). For best `via` results pass an explicit `when` timestamp — the planner ignores via for some queries without one. Use `avoidModes` (e.g. `["rail","bus"]`) to force walking; for mixed-mode legs (rail → walk → rail), prefer making one call per leg.';

export const PLAN_JOURNEY_INPUT_SCHEMA: JsonSchema = {
	type: "object",
	properties: {
		from: {
			type: "string",
			minLength: 1,
			description:
				"Origin: free text, `feedId:stopId`, or `geo:lat,lon`. Free text is auto-resolved via places/suggest.",
		},
		to: {
			type: "string",
			minLength: 1,
			description: "Destination: free text, `feedId:stopId`, or `geo:lat,lon`.",
		},
		via: {
			type: "array",
			items: { type: "string", minLength: 1 },
			maxItems: 5,
			description:
				"Optional intermediate waypoints to pass through, in order. Each accepts the same formats as `from`/`to` (free text, `feedId:stopId`, `geo:lat,lon`). Up to 5 entries.",
		},
		avoidModes: {
			type: "array",
			items: {
				type: "string",
				enum: [
					"rail",
					"bus",
					"walk",
					"ferry",
					"tram",
					"subway",
					"funicular",
					"trolleybus",
					"airplane",
				],
			},
			description:
				'Modes to exclude from the plan. e.g. `["rail","bus"]` forces a walking-only route on the requested segment. Mutually exclusive with `allowModes`.',
		},
		allowModes: {
			type: "array",
			items: {
				type: "string",
				enum: [
					"rail",
					"bus",
					"walk",
					"ferry",
					"tram",
					"subway",
					"funicular",
					"trolleybus",
					"airplane",
				],
			},
			description:
				"Restrict the plan to only these modes. Mutually exclusive with `avoidModes`.",
		},
		avoidWalk: {
			type: "boolean",
			description: "Skip plans that require walking transfers.",
		},
		when: {
			type: "string",
			format: "date-time",
			description:
				"Optional ISO8601 timestamp; defaults to the current time in the destination timezone.",
		},
		mode: {
			type: "string",
			enum: ["depart", "arrive", "first", "last"],
			default: "depart",
			description:
				"`depart` (default): leave at `when`. `arrive`: arrive by `when`. `first`/`last`: first/last service of the day.",
		},
		maxTransfers: {
			type: "integer",
			minimum: 0,
			maximum: 10,
			description: "Maximum allowed transfers (0-10).",
		},
		lang: {
			type: "string",
			enum: ["ja", "en"],
			description: "Summary language; defaults to server DEFAULT_LANG.",
		},
	},
	required: ["from", "to"],
	additionalProperties: false,
};

const MODE_TO_API: Record<
	NonNullable<PlanJourneyArgs["mode"]>,
	"departure" | "arrival" | "first" | "last"
> = {
	depart: "departure",
	arrive: "arrival",
	first: "first",
	last: "last",
};

const MODE_ENUM = new Set([
	"rail",
	"bus",
	"walk",
	"ferry",
	"tram",
	"subway",
	"funicular",
	"trolleybus",
	"airplane",
]);

function pickStrings(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const cleaned = value
		.filter((v): v is string => typeof v === "string")
		.map((v) => v.trim())
		.filter((v) => v.length > 0);
	return cleaned.length > 0 ? cleaned : undefined;
}

function pickModes(value: unknown): string[] | undefined {
	const arr = pickStrings(value);
	if (!arr) return undefined;
	const filtered = arr.filter((m) => MODE_ENUM.has(m));
	return filtered.length > 0 ? filtered : undefined;
}

export function validatePlanJourney(raw: unknown): PlanJourneyArgs {
	const obj = (raw ?? {}) as Record<string, unknown>;
	const out: PlanJourneyArgs = {
		from: typeof obj.from === "string" ? obj.from.trim() : "",
		to: typeof obj.to === "string" ? obj.to.trim() : "",
		lang: resolveLang(obj.lang, "ja"),
	};
	if (typeof obj.when === "string") out.when = obj.when;
	if (
		obj.mode === "depart" ||
		obj.mode === "arrive" ||
		obj.mode === "first" ||
		obj.mode === "last"
	) {
		out.mode = obj.mode;
	}
	if (typeof obj.maxTransfers === "number") out.maxTransfers = obj.maxTransfers;
	const via = pickStrings(obj.via);
	if (via) out.via = via.slice(0, 5);
	const avoid = pickModes(obj.avoidModes);
	if (avoid) out.avoidModes = avoid;
	const allow = pickModes(obj.allowModes);
	if (allow) out.allowModes = allow;
	if (typeof obj.avoidWalk === "boolean") out.avoidWalk = obj.avoidWalk;
	return out;
}

function looksLikeEndpoint(value: string): boolean {
	// `geo:lat,lon` or `feedId:stopId` are accepted by the planner verbatim.
	// Anything else is treated as free text and routed through suggest.
	if (value.startsWith("geo:")) return true;
	return /^[A-Za-z0-9._-]+:[A-Za-z0-9._-]+/.test(value);
}

async function resolveEndpoint(
	client: TransitClient,
	value: string,
	lang: Lang,
	preferGeo: boolean,
): Promise<string> {
	if (looksLikeEndpoint(value)) return value;
	// `via` waypoints (preferGeo=true) must work across feeds. Feed-qualified
	// ids like `scrape-jreast-yamanote:...Ueno` only resolve within their own
	// feed, so locations/suggest's top hit often won't be reachable from `from`.
	// Falling back to `geo:lat,lon` lets the planner pick the nearest station
	// in the correct feed graph automatically.
	if (preferGeo) {
		const loc = await client.GET("/api/v1/locations/suggest", {
			params: { query: { q: value, limit: 1 } },
		});
		const station = loc.data?.stations?.[0];
		if (
			station &&
			typeof station.lat === "number" &&
			typeof station.lon === "number"
		) {
			return `geo:${station.lat},${station.lon}`;
		}
	}
	const { data, error, response } = await client.GET("/api/v1/places/suggest", {
		params: { query: { q: value, limit: 5 } },
	});
	if (error || !data) {
		throw mapUpstreamError(response?.status, lang, "error_place_not_found");
	}
	const candidates = data.places ?? [];
	if (preferGeo) {
		const candidate = candidates.find(
			(p) => typeof p.lat === "number" && typeof p.lon === "number",
		);
		if (candidate?.lat !== undefined && candidate.lon !== undefined) {
			return `geo:${candidate.lat},${candidate.lon}`;
		}
	}
	const top = candidates[0];
	if (!top) {
		throw mapUpstreamError(404, lang, "error_place_not_found");
	}
	return top.endpoint ?? top.id;
}

export const createPlanJourneyTool: ToolFactory<PlanJourneyArgs> =
	(client) =>
	async (args, lang, ctx?: RequestContext): Promise<ToolResult> => {
		const fromIn = assertString(args.from, "from", lang);
		const toIn = assertString(args.to, "to", lang);

		const viaIn = args.via ?? [];
		// With via constraints, the planner needs from/to in geo form too —
		// a landmark-style place id pins the start to OSM rather than rail
		// network, so via routing through stations gets ignored.
		const preferGeo = viaIn.length > 0;
		const [from, to, ...vias] = await Promise.all([
			resolveEndpoint(client, fromIn, lang, preferGeo),
			resolveEndpoint(client, toIn, lang, preferGeo),
			...viaIn.map((v) => resolveEndpoint(client, v, lang, true)),
		]);

		const { date, time } = isoToDateAndTime(args.when);
		type GuidanceQuery = {
			from: string;
			to: string;
			type?: "departure" | "arrival" | "first" | "last";
			date?: string;
			time?: string;
			maxTransfers?: number;
			via?: string[];
			avoidModes?: string;
			allowModes?: string;
			avoidWalk?: "true" | "false";
		};
		const query: GuidanceQuery = { from, to };
		// `via` is honored only for departure/arrival queries (per API spec).
		// Default to "departure" so via routing actually takes effect.
		query.type = MODE_TO_API[args.mode ?? "depart"];
		if (date) query.date = date;
		if (time) query.time = time;
		if (typeof args.maxTransfers === "number") {
			query.maxTransfers = clampInt(args.maxTransfers, 0, 10, 4);
		}
		if (vias.length > 0) query.via = vias;
		if (args.avoidModes?.length) query.avoidModes = args.avoidModes.join(",");
		if (args.allowModes?.length) query.allowModes = args.allowModes.join(",");
		if (args.avoidWalk) query.avoidWalk = "true";

		const { data, error, response } = await client.GET(
			"/api/v1/guidance/plan",
			{ params: { query } },
		);
		if (error || !data) {
			throw mapUpstreamError(response?.status, lang, "error_not_found");
		}

		const options: PlanOption[] = (data.options ?? []).map((o) => {
			const j = o.journey;
			const legs: PlanLeg[] = (j.legs ?? []).map((leg) => {
				if (leg.kind === "transit") {
					const out: PlanLeg = {
						mode: leg.mode,
						line: leg.routeName,
						fromName: leg.from.name,
						toName: leg.to.name,
						departSec: leg.departureSecs,
						arriveSec: leg.arrivalSecs,
					};
					if (leg.from.platformCode !== undefined) {
						out.platform = leg.from.platformCode;
					}
					return out;
				}
				return {
					mode: "walk",
					fromName: leg.from.name,
					toName: leg.to.name,
					departSec: leg.departureSecs,
					arriveSec: leg.arrivalSecs,
				};
			});
			const opt: PlanOption = {
				durationSec: j.durationSecs,
				transfers: j.transferCount,
				legs,
			};
			if (j.fare?.ticket !== undefined) opt.fareYen = j.fare.ticket;
			if (o.map) {
				const points: PlanMapPoint[] = (o.map.points ?? [])
					.filter((p) => typeof p.lat === "number" && typeof p.lon === "number")
					.map((p) => {
						const pt: PlanMapPoint = {
							lat: p.lat as number,
							lon: p.lon as number,
						};
						if (p.id) pt.id = p.id;
						if (p.name) pt.name = p.name;
						if (p.role) pt.role = p.role;
						return pt;
					});
				const segments: PlanMapSegment[] = (o.map.segments ?? []).map((s) => ({
					kind: s.kind,
					polyline: (s.polyline ?? []).map((p) => ({ lat: p.lat, lon: p.lon })),
				}));
				opt.map = { points, segments };
				const b = o.map.bounds;
				if (b && typeof b.minLat === "number") {
					opt.map.bounds = {
						minLat: b.minLat,
						minLon: b.minLon,
						maxLat: b.maxLat,
						maxLon: b.maxLon,
					};
				}
			}
			return opt;
		});

		let summary: string;
		if (options.length === 0) {
			summary = t("plan_summary_no_route", lang);
		} else {
			const fastest = options.reduce(
				(best, cur) => (cur.durationSec < best.durationSec ? cur : best),
				options[0]!,
			);
			const minutes = Math.round(fastest.durationSec / 60);
			const route = fastest.legs.find((l) => l.line)?.line ?? "—";
			summary = t("plan_summary", lang, {
				count: options.length,
				minutes,
				route,
			});
		}

		let resourceUri = "";
		if (ctx) {
			try {
				// Encode only the plan payload here. Attribution + map style
				// URL are joined back in by the `/ui/plan` route from env at
				// render time, so we don't bloat resourceUri or KV cache with
				// data that is the same for every request.
				resourceUri = await buildUiResourceUri(
					ctx.host,
					{ summary, options },
					lang,
					ctx.env,
				);
			} catch {
				// Iframe is best-effort. If KV write fails, fall back to the
				// text summary; the LLM still gets a useful answer per
				// design.md §7 (degradation).
				resourceUri = "";
			}
		}

		return {
			content: [{ type: "text", text: summary }],
			structuredContent: {
				summary,
				options,
				_meta: { ui: { resourceUri } },
			},
		};
	};
