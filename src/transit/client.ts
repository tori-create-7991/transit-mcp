// Typed Transit API client built on `openapi-fetch`.
// All requests go through `cachedFetch` so Cloudflare's edge cache absorbs
// the load patterns documented in design.md section 3.

import createClient, { type Client } from "openapi-fetch";
import { cachedFetch } from "./cache";
import type { paths } from "./types.d.ts";

export const DEFAULT_TRANSIT_BASE_URL = "https://api.transit.ls8h.com";

export type TransitClient = Client<paths>;

/**
 * Build a typed Transit API client.
 *
 * @param baseUrl - API origin, e.g. `https://api.transit.ls8h.com`.
 *                  Defaults to `DEFAULT_TRANSIT_BASE_URL`.
 */
export function transitClient(
	baseUrl: string = DEFAULT_TRANSIT_BASE_URL,
): TransitClient {
	return createClient<paths>({
		baseUrl,
		fetch: cachedFetch,
	});
}
