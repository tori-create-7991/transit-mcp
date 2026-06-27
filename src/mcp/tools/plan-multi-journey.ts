/**
 * `plan_multi_journey` — chain N legs into a single itinerary.
 *
 * Each leg is planned via the same `/api/v1/guidance/plan` endpoint, with
 * its own from/to/avoidModes/allowModes/when, so callers can mix modes
 * (e.g. rail → walk-only → rail) by setting `avoidModes:["rail","bus"]`
 * on the middle leg. The fastest option from each leg is picked, then
 * concatenated into one combined response with merged duration, fare,
 * polylines, and bounds — and a single iframe `_meta.ui.resourceUri`
 * showing the full multi-leg journey on the same map.
 */

import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { Lang } from "../../i18n.js";
import { t } from "../../i18n.js";
import type { TransitClient } from "../../transit/client.js";
import { buildUiResourceUri } from "../resources/ui-resource.js";
import type {
	PlanLeg,
	PlanMapBounds,
	PlanMapData,
	PlanMapPoint,
	PlanMapSegment,
	PlanOption,
} from "./plan-journey.js";
import {
	createPlanJourneyTool,
	type PlanJourneyArgs,
	validatePlanJourney,
} from "./plan-journey.js";
import {
	assertString,
	type JsonSchema,
	type RequestContext,
	resolveLang,
	type ToolFactory,
	type ToolResult,
} from "./shared.js";

export type MultiLegArgs = {
	from: string;
	to: string;
	when?: string;
	mode?: "depart" | "arrive" | "first" | "last";
	avoidModes?: string[];
	allowModes?: string[];
	avoidWalk?: boolean;
	maxTransfers?: number;
	note?: string;
};

export type PlanMultiJourneyArgs = {
	legs: MultiLegArgs[];
	lang?: Lang;
};

export const PLAN_MULTI_JOURNEY_NAME = "plan_multi_journey";

export const PLAN_MULTI_JOURNEY_DESCRIPTION =
	'Plan a sequence of N transit legs in order and combine them into one consolidated itinerary. Use this when the user wants different modes on different legs — e.g. "rail from Tokyo to Ueno, walk from Ueno to Akihabara, rail from Akihabara to Kawasaki". Each leg accepts the same args as plan_journey (`from`, `to`, `avoidModes`, `allowModes`, `when`, `mode`, etc.); the fastest option per leg is picked. Returns one combined `summary`, total `durationSec` / `transfers` / `fareYen`, flattened `legs[]`, and a single iframe (`_meta.ui.resourceUri`) drawing every segment on one map.';

const LEG_PROPS: Record<string, unknown> = {
	from: { type: "string", minLength: 1, description: "Origin for this leg." },
	to: {
		type: "string",
		minLength: 1,
		description: "Destination for this leg.",
	},
	when: {
		type: "string",
		format: "date-time",
		description: "Optional ISO8601 timestamp for this leg's departure.",
	},
	mode: {
		type: "string",
		enum: ["depart", "arrive", "first", "last"],
		description: "Same as plan_journey.mode.",
	},
	avoidModes: {
		type: "array",
		items: {
			type: "string",
			enum: [
				"rail",
				"bus",
				"ferry",
				"air",
				"tram",
				"subway",
				"cable",
				"funicular",
				"monorail",
				"trolleybus",
			],
		},
		description: 'e.g. `["rail","bus"]` forces walking-only for this leg.',
	},
	allowModes: {
		type: "array",
		items: {
			type: "string",
			enum: [
				"rail",
				"bus",
				"ferry",
				"air",
				"tram",
				"subway",
				"cable",
				"funicular",
				"monorail",
				"trolleybus",
			],
		},
		description: "Restrict this leg to only these modes.",
	},
	avoidWalk: {
		type: "boolean",
		description: "Skip plans needing walking transfers.",
	},
	maxTransfers: {
		type: "integer",
		minimum: 0,
		maximum: 10,
		description: "Max transfers within this leg.",
	},
	note: {
		type: "string",
		description: "Optional free-text label for this leg, shown in the summary.",
	},
};

export const PLAN_MULTI_JOURNEY_INPUT_SCHEMA: JsonSchema = {
	type: "object",
	properties: {
		legs: {
			type: "array",
			minItems: 2,
			maxItems: 8,
			items: {
				type: "object",
				properties: LEG_PROPS,
				required: ["from", "to"],
				additionalProperties: false,
			},
			description:
				"Ordered list of legs. The `to` of one leg should typically match the `from` of the next.",
		},
		lang: {
			type: "string",
			enum: ["ja", "en"],
			description: "Summary language; defaults to server DEFAULT_LANG.",
		},
	},
	required: ["legs"],
	additionalProperties: false,
};

export function validatePlanMultiJourney(raw: unknown): PlanMultiJourneyArgs {
	const obj = (raw ?? {}) as Record<string, unknown>;
	if (!Array.isArray(obj.legs) || obj.legs.length < 2) {
		throw new McpError(
			ErrorCode.InvalidParams,
			"plan_multi_journey requires at least 2 legs",
		);
	}
	if (obj.legs.length > 8) {
		throw new McpError(
			ErrorCode.InvalidParams,
			"plan_multi_journey accepts at most 8 legs",
		);
	}
	const lang = resolveLang(obj.lang, "ja");
	const legs: MultiLegArgs[] = obj.legs.map((rawLeg, i) => {
		const leg = (rawLeg ?? {}) as Record<string, unknown>;
		const out: MultiLegArgs = {
			from: typeof leg.from === "string" ? leg.from.trim() : "",
			to: typeof leg.to === "string" ? leg.to.trim() : "",
		};
		if (!out.from || !out.to) {
			throw new McpError(
				ErrorCode.InvalidParams,
				`leg[${i}] requires both 'from' and 'to'`,
			);
		}
		if (typeof leg.when === "string") out.when = leg.when;
		if (
			leg.mode === "depart" ||
			leg.mode === "arrive" ||
			leg.mode === "first" ||
			leg.mode === "last"
		) {
			out.mode = leg.mode;
		}
		if (Array.isArray(leg.avoidModes)) {
			const arr = leg.avoidModes.filter(
				(m): m is string => typeof m === "string",
			);
			if (arr.length > 0) out.avoidModes = arr;
		}
		if (Array.isArray(leg.allowModes)) {
			const arr = leg.allowModes.filter(
				(m): m is string => typeof m === "string",
			);
			if (arr.length > 0) out.allowModes = arr;
		}
		if (typeof leg.avoidWalk === "boolean") out.avoidWalk = leg.avoidWalk;
		if (typeof leg.maxTransfers === "number")
			out.maxTransfers = leg.maxTransfers;
		if (typeof leg.note === "string" && leg.note.length > 0)
			out.note = leg.note;
		return out;
	});
	return { legs, lang };
}

function combineMaps(maps: PlanMapData[]): PlanMapData {
	const points: PlanMapPoint[] = [];
	const seen = new Set<string>();
	for (const m of maps) {
		for (const p of m.points) {
			const key = `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
			if (seen.has(key)) continue;
			seen.add(key);
			points.push(p);
		}
	}
	const segments: PlanMapSegment[] = maps.flatMap((m) => m.segments);
	const allBounds = maps
		.map((m) => m.bounds)
		.filter((b): b is PlanMapBounds => !!b);
	let bounds: PlanMapBounds | undefined;
	if (allBounds.length > 0) {
		bounds = {
			minLat: Math.min(...allBounds.map((b) => b.minLat)),
			minLon: Math.min(...allBounds.map((b) => b.minLon)),
			maxLat: Math.max(...allBounds.map((b) => b.maxLat)),
			maxLon: Math.max(...allBounds.map((b) => b.maxLon)),
		};
	} else if (points.length > 0) {
		const lats = points.map((p) => p.lat);
		const lons = points.map((p) => p.lon);
		bounds = {
			minLat: Math.min(...lats),
			minLon: Math.min(...lons),
			maxLat: Math.max(...lats),
			maxLon: Math.max(...lons),
		};
	}
	return bounds ? { points, segments, bounds } : { points, segments };
}

export const createPlanMultiJourneyTool: ToolFactory<PlanMultiJourneyArgs> =
	(client) =>
	async (args, lang, ctx?: RequestContext): Promise<ToolResult> => {
		if (args.legs.length < 2) {
			throw new McpError(
				ErrorCode.InvalidParams,
				"plan_multi_journey requires at least 2 legs",
			);
		}

		const innerHandler = createPlanJourneyTool(client);
		const legGroups: Array<{
			index: number;
			from: string;
			to: string;
			note?: string;
			options: PlanOption[];
		}> = [];
		const perLegSummaries: string[] = [];

		for (let i = 0; i < args.legs.length; i++) {
			const leg = args.legs[i]!;
			assertString(leg.from, `legs[${i}].from`, lang);
			assertString(leg.to, `legs[${i}].to`, lang);
			const planArgs: PlanJourneyArgs = validatePlanJourney({
				from: leg.from,
				to: leg.to,
				lang,
				...(leg.when ? { when: leg.when } : {}),
				...(leg.mode ? { mode: leg.mode } : {}),
				...(leg.maxTransfers !== undefined
					? { maxTransfers: leg.maxTransfers }
					: {}),
				...(leg.avoidModes ? { avoidModes: leg.avoidModes } : {}),
				...(leg.allowModes ? { allowModes: leg.allowModes } : {}),
				...(leg.avoidWalk ? { avoidWalk: leg.avoidWalk } : {}),
			});
			const result = await innerHandler(planArgs, lang);
			const sc = result.structuredContent as
				| { summary?: string; options?: PlanOption[] }
				| undefined;
			const options = sc?.options ?? [];
			if (options.length === 0) {
				throw new McpError(
					ErrorCode.InvalidParams,
					`${t("error_not_found", lang)} (leg ${i + 1})`,
				);
			}
			// Cap to top 4 options per leg to keep the iframe payload bounded
			// (4 legs × 4 options × ~3KB map ≈ 48KB, still well inside KV).
			const trimmed = options.slice(0, 4);
			const group: {
				index: number;
				from: string;
				to: string;
				note?: string;
				options: PlanOption[];
			} = {
				index: i,
				from: leg.from,
				to: leg.to,
				options: trimmed,
			};
			if (leg.note) group.note = leg.note;
			legGroups.push(group);
			if (sc?.summary) perLegSummaries.push(sc.summary);
		}

		// Default selection: the planner's top option per leg.
		const defaultIndices = legGroups.map(() => 0);
		const perLegOptions: PlanOption[] = legGroups.map(
			(g, i) => g.options[defaultIndices[i] ?? 0]!,
		);

		const totalDurationSec = perLegOptions.reduce(
			(acc, o) => acc + o.durationSec,
			0,
		);
		const innerTransfers = perLegOptions.reduce(
			(acc, o) => acc + o.transfers,
			0,
		);
		const interLegTransfers = perLegOptions.length - 1;
		const totalTransfers = innerTransfers + interLegTransfers;
		const fares = perLegOptions
			.map((o) => o.fareYen)
			.filter((y): y is number => typeof y === "number");
		const totalFare =
			fares.length > 0 ? fares.reduce((a, b) => a + b, 0) : undefined;
		const flatLegs: PlanLeg[] = perLegOptions.flatMap((o) => o.legs);
		const combinedMap = combineMaps(
			perLegOptions.map((o) => o.map).filter((m): m is PlanMapData => !!m),
		);

		const minutes = Math.round(totalDurationSec / 60);
		const summary = t("multi_plan_summary", lang, {
			count: perLegOptions.length,
			minutes,
			transfers: totalTransfers,
		});

		const combined: PlanOption = {
			durationSec: totalDurationSec,
			transfers: totalTransfers,
			legs: flatLegs,
			map: combinedMap,
		};
		if (totalFare !== undefined) combined.fareYen = totalFare;

		let resourceUri = "";
		if (ctx) {
			try {
				// Iframe receives the full leg groups so the UI can render a
				// per-leg picker and re-compute the combined view client-side
				// when the user swaps options. `defaultIndices` and the initial
				// combined option are kept so a static viewer (no JS) still
				// shows something meaningful.
				resourceUri = await buildUiResourceUri(
					ctx.host,
					{
						summary,
						options: [combined],
						legGroups,
						defaultIndices,
					},
					lang,
					ctx.env,
				);
			} catch {
				resourceUri = "";
			}
		}

		return {
			content: [{ type: "text", text: summary }],
			structuredContent: {
				summary,
				options: [combined],
				legGroups,
				defaultIndices,
				perLegSummaries,
				_meta: { ui: { resourceUri } },
			},
		};
	};
