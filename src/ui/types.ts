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
};

export type PlanOptionUi = {
	durationSec: number;
	transfers: number;
	fareYen?: number;
	legs: PlanLegUi[];
};

export type PlanData = {
	summary: string;
	options: PlanOptionUi[];
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
