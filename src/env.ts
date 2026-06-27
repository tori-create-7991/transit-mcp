/**
 * Cloudflare Workers bindings exposed to the request handler.
 *
 * Populated by wrangler.toml `[vars]` and `[[kv_namespaces]]`.
 */
export type Env = {
	UI_CACHE: KVNamespace;
	TRANSIT_API_BASE: string;
	MAP_STYLE_URL: string;
	DEFAULT_LANG: "ja" | "en";
};
