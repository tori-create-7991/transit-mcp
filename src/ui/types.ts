/**
 * Shared types between the server (plan_journey output) and the iframe UI.
 *
 * The iframe receives a JSON payload via `window.__TRANSIT_DATA__`. The
 * `PlanData` type mirrors the `structuredContent` shape from
 * `plan-journey.ts`.
 */

export type PlanLegUi = {
	mode: string;
	line?: string;
	fromName: string;
	toName: string;
	departSec: number;
	arriveSec: number;
	platform?: string;
	color?: string;
	headsign?: string;
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

export type PlanOptionUi = {
	durationSec: number;
	transfers: number;
	fareYen?: number;
	fareIcYen?: number;
	legs: PlanLegUi[];
	map?: PlanMapData;
};

export type PlanLegGroupUi = {
	index: number;
	from: string;
	to: string;
	note?: string;
	options: PlanOptionUi[];
};

export type PlanData = {
	summary: string;
	options: PlanOptionUi[];
	/** Present when the payload is a multi-leg plan (one entry per leg). */
	legGroups?: PlanLegGroupUi[];
	/** Default selected option index per leg group. */
	defaultIndices?: number[];
};

export type AttributionData = {
	feeds: string[];
	operators: string[];
	mapAttribution: string;
};

export type IframeBootstrap = {
	plan: PlanData;
	attribution: AttributionData;
	mapStyleUrl: string;
	lang: "ja" | "en";
};
