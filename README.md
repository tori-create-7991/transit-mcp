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

The server speaks the **Streamable HTTP** MCP transport. Once deployed it is
reachable at `https://transit-mcp.<your-cf-account>.workers.dev/mcp`.

### Claude Desktop

Edit your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Add a `transit-mcp` entry under `mcpServers`:

```jsonc
{
  "mcpServers": {
    "transit-mcp": {
      "type": "http",
      "url": "https://transit-mcp.<your-cf-account>.workers.dev/mcp"
    }
  }
}
```

Restart Claude Desktop. The four tools appear in the tool picker. Try:

- 「渋谷から東京駅までの経路を教えて」 → `plan_journey` runs and an
  interactive map iframe is embedded directly in the chat.
- 「新宿駅の次の発車は？」 → `station_departures` returns the next trains.
- "Plan a route from Shibuya to Tokyo Station" → English summary, same map.
- "What's the next train from Shinjuku?" → `station_departures`.

If you self-host you can point at `http://localhost:8787/mcp` for local
development.

### ChatGPT (Apps SDK)

The MCP Apps SDK in ChatGPT discovers servers by URL exactly like Claude
Desktop:

1. Open ChatGPT settings → **Apps & Connectors** → **Add MCP Server**.
2. Enter the server URL: `https://transit-mcp.<your-cf-account>.workers.dev/mcp`.
3. Choose transport: **Streamable HTTP**.
4. Approve the four tools when prompted.

The iframe HTML resource is served from `/ui/plan` on the same Worker and is
rendered inline in ChatGPT just like in Claude Desktop.

#### Custom GPT (Actions) fallback

If you need to register transit-mcp inside a Custom GPT before Apps SDK is
available in your tier, wrap the tools as OpenAI Actions:

1. Create a Custom GPT in the ChatGPT builder.
2. Under **Actions → Create new action**, import an OpenAPI 3.1 schema that
   POSTs to `/mcp` with the standard MCP envelope. (A minimal example schema
   lives in `examples/openai-actions/` — TODO for v0.2.)
3. Note: Custom GPT Actions cannot render the `_meta.ui.resourceUri` iframe;
   only the textual summary will be displayed.

For the richest experience, prefer the Apps SDK path.

## Local development

```bash
pnpm install
pnpm dev          # Wrangler dev server on http://localhost:8787
pnpm inspect      # MCP Inspector against the local server
```

Useful scripts:

- `pnpm test` / `pnpm test:watch` — Vitest (65 tests at time of writing)
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` / `pnpm format` — Biome
- `pnpm build:ui` — bundle the iframe UI with esbuild
- `pnpm generate:types` — regenerate Transit API types from its OpenAPI

To exercise tools locally with the MCP Inspector:

```bash
pnpm dev          # terminal 1
pnpm inspect      # terminal 2 → http://localhost:6274
# In the Inspector, click `connect`, then `tools/call`:
#   { "name": "plan_journey", "arguments": { "from": "渋谷", "to": "東京" } }
# Copy the returned _meta.ui.resourceUri into a browser tab — the iframe HTML
# will render the route on a MapLibre map.
```

## Deployment

```bash
pnpm build:ui
pnpm dlx wrangler@latest deploy
```

Pre-flight: the KV namespace `UI_CACHE` must exist before deploy.

```bash
pnpm dlx wrangler@latest kv namespace create UI_CACHE
# Copy the returned id into wrangler.toml under [[kv_namespaces]].
```

A dry-run is also wired into CI for every PR:

```bash
pnpm dlx wrangler@latest deploy --dry-run
```

## Configuration

| Var | Where | Default |
|-----|-------|---------|
| `TRANSIT_API_BASE` | `wrangler.toml` `[vars]` | `https://api.transit.ls8h.com` |
| `MAP_STYLE_URL` | `wrangler.toml` `[vars]` | OpenFreeMap public style URL |
| `DEFAULT_LANG` | `wrangler.toml` `[vars]` | `ja` |
| `UI_CACHE` | KV binding | created per env (`wrangler kv namespace create`) |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secret | required by `deploy` job |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secret | required by `deploy` job |

## Attribution

Required attribution is surfaced in the iframe footer:

- **Transit data**: per-feed credits returned by `/api/v1/feeds` and
  `/api/v1/operators` (cached in KV for 1 hour).
- **Map tiles**: © [OpenStreetMap](https://www.openstreetmap.org/copyright)
  contributors, served via [© OpenFreeMap](https://openfreemap.org).

Override `MAP_STYLE_URL` if you self-host MapTiler / Protomaps and want their
attribution shown instead — the iframe reads it from the worker env at render
time.

## License

[MIT](./LICENSE).
