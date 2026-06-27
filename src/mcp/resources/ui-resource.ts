/**
 * Build the `_meta.ui.resourceUri` URL for the MCP Apps iframe.
 *
 * Strategy:
 *  - Encode `data` as JSON. If the base64url-encoded JSON fits in ≤ 30KB
 *    of query string, inline it as `?d=<b64url>` — zero round-trips for
 *    the host, KV stays cold.
 *  - Otherwise store the raw JSON in `UI_CACHE` keyed by a random UUID
 *    with a 1h TTL, and return `?k=<uuid>` instead.
 *
 * `?lang=<ja|en>` is always appended so the iframe knows which dictionary
 * to mount even before client-side detection runs.
 */

import type { Env } from "../../env.js";

const INLINE_MAX_BYTES = 30_000;
const KV_TTL_SECONDS = 3600;

/**
 * Encode a UTF-8 string to base64url (no padding, no `+` or `/`).
 * Works in both Node 20+ and the Workers runtime via `btoa`. We round-trip
 * through `TextEncoder` so multi-byte chars survive `btoa`'s latin1
 * limitation.
 */
function base64UrlEncode(input: string): string {
	const bytes = new TextEncoder().encode(input);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	const b64 = btoa(binary);
	return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function buildUiResourceUri(
	host: string,
	data: unknown,
	lang: "ja" | "en",
	env: Env,
): Promise<string> {
	const json = JSON.stringify(data);
	const b64 = base64UrlEncode(json);
	const base = `${host}/ui/plan`;
	if (b64.length <= INLINE_MAX_BYTES) {
		return `${base}?d=${b64}&lang=${lang}`;
	}
	const id = crypto.randomUUID();
	await env.UI_CACHE.put(id, json, { expirationTtl: KV_TTL_SECONDS });
	return `${base}?k=${id}&lang=${lang}`;
}
