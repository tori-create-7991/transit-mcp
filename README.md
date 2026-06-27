# transit-mcp

MCP server for Japanese public transit transfer / journey planning, with a
map-based iframe UI rendered inside Claude and ChatGPT through the Model
Context Protocol Apps SDK.

Built on Cloudflare Workers (Hono) + `@modelcontextprotocol/sdk` (Streamable
HTTP transport) + `@modelcontextprotocol/ext-apps` + React + MapLibre GL. It
wraps the public Transit API (`api.transit.ls8h.com`) behind the Cloudflare
Cache and exposes four tools to MCP clients.

## Features

Four tools are exposed over MCP:

- `search_places` — fuzzy place / station search by free-text query.
- `plan_journey` — point-to-point journey planning from free-text `from` / `to`.
  Returns a map-based iframe HTML resource with the route drawn over a
  MapLibre map.
- `station_departures` — upcoming departures for a station at a given time.
- `station_detail` — full detail of a single station (lines served, exits,
  etc.).

Only `plan_journey` returns an MCP UI resource (`_meta.ui.resourceUri`); the
other three return JSON only.

## Quick start (clients)

### Claude Desktop

Add to `claude_desktop_config.json` (see the official MCP docs for the file
location on your OS):

```jsonc
{
  "mcpServers": {
    "transit-mcp": {
      "url": "https://transit-mcp.<your-cf-account>.workers.dev/mcp"
    }
  }
}
```

Restart Claude Desktop. Ask something like
「渋谷から東京駅までの経路を教えて」 — the answer will include an embedded
map iframe.

### ChatGPT (Apps SDK)

Register the same `/mcp` URL in your Custom GPT / Apps SDK configuration. The
iframe HTML resource is served from `/ui/plan` on the same Worker.

> Full Claude / ChatGPT registration screenshots will be added once the first
> public deploy is up.

## Local development

```bash
pnpm install
pnpm dev          # Wrangler dev server on http://localhost:8787
pnpm inspect      # MCP Inspector against the local server
```

Useful scripts:

- `pnpm test` / `pnpm test:watch` — Vitest
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` / `pnpm format` — Biome
- `pnpm build:ui` — bundle the iframe UI with esbuild
- `pnpm generate:types` — regenerate Transit API types from its OpenAPI

## Deployment

```bash
pnpm build:ui
pnpm dlx wrangler@latest deploy
```

The KV namespace `UI_CACHE` must exist before deploy
(`wrangler kv namespace create UI_CACHE`).

## Configuration

| Var | Where | Default |
|-----|-------|---------|
| `TRANSIT_API_BASE` | `wrangler.toml` `[vars]` | `https://api.transit.ls8h.com` |
| `MAP_STYLE_URL` | `wrangler.toml` `[vars]` | OpenFreeMap public style URL |
| `DEFAULT_LANG` | `wrangler.toml` `[vars]` | `ja` |
| `UI_CACHE` | KV binding | created per env |

## Attribution

Required attribution surfaced in the iframe footer:

- Transit data: Transit API (`api.transit.ls8h.com`) and the upstream feed
  operators it aggregates.
- Base map: © OpenStreetMap contributors, served via OpenFreeMap (or your
  configured `MAP_STYLE_URL`).

## License

[MIT](./LICENSE).
