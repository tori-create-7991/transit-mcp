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
	when?: string;
	mode?: "depart" | "arrive" | "first" | "last";
	maxTransfers?: number;
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
	"Plan a journey on Japanese public transit between two places. Accepts free-text place names, feed-qualified station ids (`feedId:stopId`), or `geo:lat,lon` for both `from` and `to`. Returns ranked itineraries with duration, transfer count, fare, and per-leg details.";

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
): Promise<string> {
	if (looksLikeEndpoint(value)) return value;
	const { data, error, response } = await client.GET("/api/v1/places/suggest", {
		params: { query: { q: value, limit: 1 } },
	});
	if (error || !data) {
		throw mapUpstreamError(response?.status, lang, "error_place_not_found");
	}
	const top = data.places?.[0];
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

		const [from, to] = await Promise.all([
			resolveEndpoint(client, fromIn, lang),
			resolveEndpoint(client, toIn, lang),
		]);

		const { date, time } = isoToDateAndTime(args.when);
		type GuidanceQuery = {
			from: string;
			to: string;
			type?: "departure" | "arrival" | "first" | "last";
			date?: string;
			time?: string;
			maxTransfers?: number;
		};
		const query: GuidanceQuery = { from, to };
		if (args.mode) query.type = MODE_TO_API[args.mode];
		if (date) query.date = date;
		if (time) query.time = time;
		if (typeof args.maxTransfers === "number") {
			query.maxTransfers = clampInt(args.maxTransfers, 0, 10, 4);
		}

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
