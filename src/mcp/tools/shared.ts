/**
 * Shared types and helpers for the four transit tools.
 *
 * Each tool is implemented as a factory `createXxxTool(client)` returning a
 * handler that accepts already-validated `args` and a resolved `lang`. The
 * factory shape keeps unit tests trivial: pass an inert mock `TransitClient`
 * and assert against the returned handler.
 *
 * Input validation lives in `validateXxx` helpers — we keep validation
 * dependency-free (no zod) so the bundle stays small and the same JSON
 * Schema objects can be advertised to MCP clients verbatim.
 */

import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { type Lang, t } from "../../i18n.js";
import type { TransitClient } from "../../transit/client.js";

export type ToolContent = {
	type: "text";
	text: string;
};

export type ToolResult = {
	content: ToolContent[];
	structuredContent?: Record<string, unknown>;
	_meta?: Record<string, unknown>;
};

/**
 * Optional per-request context the MCP server threads through to handlers.
 * Right now only `plan_journey` needs it (to build the iframe resourceUri
 * with the live origin + KV binding); other tools ignore it.
 */
export type RequestContext = {
	host: string;
	env: import("../../env.js").Env;
};

export type ToolHandler<Args> = (
	args: Args,
	lang: Lang,
	ctx?: RequestContext,
) => Promise<ToolResult>;

export type ToolFactory<Args> = (client: TransitClient) => ToolHandler<Args>;

export type JsonSchema = {
	type: "object";
	properties: Record<string, unknown>;
	required?: string[];
	additionalProperties?: boolean;
};

/**
 * Treat status as a transient upstream failure that justifies one retry.
 * 5xx and 429 cover the upstream-broken / rate-limited cases.
 */
export function isRetriableStatus(status: number): boolean {
	return status >= 500 || status === 429;
}

/**
 * Map an upstream Transit API error response into an MCP error.
 * 400 → InvalidParams, 404 → InvalidParams (with caller-supplied message
 * for the localized hint), 5xx/timeout → InternalError.
 */
export function mapUpstreamError(
	status: number | undefined,
	lang: Lang,
	notFoundKey: string,
): McpError {
	if (status === 404) {
		return new McpError(ErrorCode.InvalidParams, t(notFoundKey, lang));
	}
	if (status === 400 || status === 422) {
		return new McpError(
			ErrorCode.InvalidParams,
			t("error_invalid_input", lang),
		);
	}
	if (status === 429) {
		return new McpError(ErrorCode.InternalError, t("error_rate_limited", lang));
	}
	return new McpError(ErrorCode.InternalError, t("error_upstream", lang));
}

/**
 * Coerce a value to a positive integer within [min, max]. Returns `fallback`
 * when the value is missing or invalid (so callers can keep default semantics
 * documented in the JSON schema without re-checking).
 */
export function clampInt(
	value: unknown,
	min: number,
	max: number,
	fallback: number,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}
	const n = Math.floor(value);
	if (n < min) return min;
	if (n > max) return max;
	return n;
}

export function assertString(value: unknown, name: string, lang: Lang): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new McpError(
			ErrorCode.InvalidParams,
			`${t("error_invalid_input", lang)}: ${name}`,
		);
	}
	return value;
}

export function resolveLang(value: unknown, fallback: Lang): Lang {
	if (value === "ja" || value === "en") return value;
	return fallback;
}

/**
 * Format an ISO8601 timestamp into the Transit API's `date` (YYYYMMDD) and
 * `time` (HH:MM:SS) query params. Returns `undefined` slots when the input is
 * absent or unparseable — callers omit the param in that case.
 */
export function isoToDateAndTime(iso: string | undefined): {
	date?: string;
	time?: string;
} {
	if (!iso) return {};
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return {};
	const yyyy = d.getUTCFullYear().toString().padStart(4, "0");
	const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0");
	const dd = d.getUTCDate().toString().padStart(2, "0");
	const hh = d.getUTCHours().toString().padStart(2, "0");
	const mi = d.getUTCMinutes().toString().padStart(2, "0");
	const ss = d.getUTCSeconds().toString().padStart(2, "0");
	return { date: `${yyyy}${mm}${dd}`, time: `${hh}:${mi}:${ss}` };
}
