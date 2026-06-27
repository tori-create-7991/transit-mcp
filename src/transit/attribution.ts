/**
 * Attribution data for the iframe footer.
 *
 * Fetches feed credits and operator names from the Transit API
 * (`/api/v1/feeds` + `/api/v1/operators`) and caches the joined result in
 * `UI_CACHE` under the key `attribution:v1` for 1 hour. Per design.md
 * section 5, the iframe MUST display data attribution.
 *
 * `mapAttribution` is sourced from a static string (OpenFreeMap / MapLibre
 * boilerplate) since the map style URL is the same for every request.
 */

import type { Env } from "../env.js";
import { transitClient } from "./client.js";

export type Attribution = {
	feeds: string[];
	operators: string[];
	mapAttribution: string;
};

const CACHE_KEY = "attribution:v1";
const CACHE_TTL_SECONDS = 3600;

// OpenFreeMap is the default tile provider in wrangler.toml. If
// MAP_STYLE_URL is overridden this static string may be inaccurate but
// remains generic enough to satisfy MapLibre's attribution policy.
const DEFAULT_MAP_ATTRIBUTION =
	'© <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · ' +
	'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

export async function getAttributions(env: Env): Promise<Attribution> {
	try {
		const cached = await env.UI_CACHE.get(CACHE_KEY);
		if (cached) {
			return JSON.parse(cached) as Attribution;
		}
	} catch {
		// KV read failures are non-fatal; we re-fetch below.
	}
	const fresh = await fetchAttributions(env);
	try {
		await env.UI_CACHE.put(CACHE_KEY, JSON.stringify(fresh), {
			expirationTtl: CACHE_TTL_SECONDS,
		});
	} catch {
		// best-effort cache write
	}
	return fresh;
}

async function fetchAttributions(env: Env): Promise<Attribution> {
	const client = transitClient(env.TRANSIT_API_BASE);
	const feeds: string[] = [];
	const operators: string[] = [];
	try {
		const { data } = await client.GET("/api/v1/feeds", {});
		const items =
			(data as { feeds?: Array<{ name?: string; license?: string }> })?.feeds ??
			[];
		for (const f of items) {
			if (f.name) feeds.push(f.license ? `${f.name} (${f.license})` : f.name);
		}
	} catch {
		// best-effort
	}
	try {
		const { data } = await client.GET("/api/v1/operators", {});
		const items =
			(data as { operators?: Array<{ name?: string }> })?.operators ?? [];
		for (const o of items) {
			if (o.name) operators.push(o.name);
		}
	} catch {
		// best-effort
	}
	return {
		feeds,
		operators,
		mapAttribution: DEFAULT_MAP_ATTRIBUTION,
	};
}
