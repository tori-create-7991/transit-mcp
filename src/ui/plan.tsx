/**
 * Browser entry for the iframe. Reads the bootstrap payload from
 * `window.__TRANSIT_DATA__` and mounts the React tree under `#app`.
 *
 * Two display modes share the same shell:
 *  - Single-leg: `plan.options` is rendered as a clickable card list, and
 *    the selected option's map is shown.
 *  - Multi-leg: `plan.legGroups` is present; we render a `LegPicker` and
 *    recompute the combined totals + map on the client whenever the user
 *    swaps an option for a leg.
 */

import { type ReactElement, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Attribution } from "./components/Attribution.js";
import { LangToggle } from "./components/LangToggle.js";
import { LegPicker } from "./components/LegPicker.js";
import { MapView } from "./components/MapView.js";
import { RouteCard } from "./components/RouteCard.js";
import { detectLang, makeT, persistLang, type UiLang } from "./i18n/index.js";
import type {
	IframeBootstrap,
	PlanData,
	PlanLegUi,
	PlanMapBounds,
	PlanMapData,
	PlanMapPoint,
	PlanMapSegment,
	PlanOptionUi,
} from "./types.js";

declare global {
	interface Window {
		__TRANSIT_DATA__?: IframeBootstrap;
	}
}

function combineMaps(maps: PlanMapData[]): PlanMapData | undefined {
	if (maps.length === 0) return undefined;
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

function combineSelectedOptions(
	groups: { options: PlanOptionUi[] }[],
	indices: number[],
): PlanOptionUi {
	const picked = groups.map(
		(g, i) => g.options[indices[i] ?? 0] ?? g.options[0],
	) as PlanOptionUi[];
	const totalDuration = picked.reduce((acc, o) => acc + o.durationSec, 0);
	const innerTransfers = picked.reduce((acc, o) => acc + o.transfers, 0);
	const interLegTransfers = Math.max(picked.length - 1, 0);
	const fares = picked
		.map((o) => o.fareYen)
		.filter((y): y is number => typeof y === "number");
	const totalFare =
		fares.length > 0 ? fares.reduce((a, b) => a + b, 0) : undefined;
	const flatLegs: PlanLegUi[] = picked.flatMap((o) => o.legs);
	const combinedMap = combineMaps(
		picked.map((o) => o.map).filter((m): m is PlanMapData => !!m),
	);
	const combined: PlanOptionUi = {
		durationSec: totalDuration,
		transfers: innerTransfers + interLegTransfers,
		legs: flatLegs,
	};
	if (totalFare !== undefined) combined.fareYen = totalFare;
	if (combinedMap) combined.map = combinedMap;
	return combined;
}

function App(props: { boot: IframeBootstrap }): ReactElement {
	const { boot } = props;
	const [lang, setLang] = useState<UiLang>(() => {
		const detected = detectLang();
		if (typeof window !== "undefined") {
			try {
				const stored = window.localStorage?.getItem("transit_lang");
				if (stored === "ja" || stored === "en") return stored;
			} catch {
				/* ignore */
			}
		}
		return detected === "ja" && boot.lang === "en" ? "en" : detected;
	});
	const t = useMemo(() => makeT(lang), [lang]);

	const onLang = (next: UiLang) => {
		setLang(next);
		persistLang(next);
	};

	const legGroups = boot.plan.legGroups;
	const isMulti = Array.isArray(legGroups) && legGroups.length > 0;

	if (isMulti) {
		return (
			<MultiLegApp
				boot={boot}
				lang={lang}
				onLang={onLang}
				t={t}
				groups={legGroups}
			/>
		);
	}

	return <SingleLegApp boot={boot} lang={lang} onLang={onLang} t={t} />;
}

function SingleLegApp(props: {
	boot: IframeBootstrap;
	lang: UiLang;
	onLang: (l: UiLang) => void;
	t: ReturnType<typeof makeT>;
}): ReactElement {
	const { boot, lang, onLang, t } = props;
	const options = boot.plan.options ?? [];
	const hasData = options.length > 0;

	const [selectedIdx, setSelectedIdx] = useState(0);
	const safeIdx = Math.min(selectedIdx, Math.max(options.length - 1, 0));
	const selectedMap = options[safeIdx]?.map;

	return (
		<div className="app">
			<LangToggle lang={lang} onChange={onLang} t={t} />
			<ol className="app__routes" aria-label={t("app.title")}>
				{hasData ? (
					options.map((opt, idx) => (
						<RouteCard
							// biome-ignore lint/suspicious/noArrayIndexKey: routes are ordered & stable per payload
							key={idx}
							option={opt}
							rank={idx + 1}
							t={t}
							active={idx === safeIdx}
							onSelect={() => setSelectedIdx(idx)}
						/>
					))
				) : (
					<li className="empty-state">{t("error.no_data")}</li>
				)}
			</ol>
			<div className="app__map">
				{selectedMap ? (
					<MapView mapStyleUrl={boot.mapStyleUrl} map={selectedMap} />
				) : (
					<MapView mapStyleUrl={boot.mapStyleUrl} />
				)}
			</div>
			<Attribution
				feeds={boot.attribution.feeds}
				operators={boot.attribution.operators}
				mapAttribution={boot.attribution.mapAttribution}
				t={t}
			/>
		</div>
	);
}

function MultiLegApp(props: {
	boot: IframeBootstrap;
	lang: UiLang;
	onLang: (l: UiLang) => void;
	t: ReturnType<typeof makeT>;
	groups: NonNullable<IframeBootstrap["plan"]["legGroups"]>;
}): ReactElement {
	const { boot, lang, onLang, t, groups } = props;
	const defaults = boot.plan.defaultIndices ?? groups.map(() => 0);
	const [indices, setIndices] = useState<number[]>(defaults);

	const safeIndices = useMemo(
		() => groups.map((g, i) => Math.min(indices[i] ?? 0, g.options.length - 1)),
		[groups, indices],
	);
	const combined = useMemo(
		() => combineSelectedOptions(groups, safeIndices),
		[groups, safeIndices],
	);
	const combinedMap = combined.map;

	return (
		<div className="app">
			<LangToggle lang={lang} onChange={onLang} t={t} />
			<div className="app__routes app__routes--multi">
				<RouteCard option={combined} rank={1} t={t} active defaultExpanded />
				<LegPicker
					groups={groups}
					selectedIndices={safeIndices}
					onChange={setIndices}
					t={t}
				/>
			</div>
			<div className="app__map">
				{combinedMap ? (
					<MapView mapStyleUrl={boot.mapStyleUrl} map={combinedMap} />
				) : (
					<MapView mapStyleUrl={boot.mapStyleUrl} />
				)}
			</div>
			<Attribution
				feeds={boot.attribution.feeds}
				operators={boot.attribution.operators}
				mapAttribution={boot.attribution.mapAttribution}
				t={t}
			/>
		</div>
	);
}

/**
 * MCP Apps SDK bridge. When the iframe is rendered inside ChatGPT / Claude
 * Desktop / any MCP Apps host, the host runs an `AppBridge` on its side and
 * we run the corresponding `App` on the iframe side. The protocol is
 * JSON-RPC over `postMessage`:
 *   - we send `ui/notifications/initialized` after `connect()`
 *   - host sends `ui/notifications/tool-result` whose `params` is the
 *     CallToolResult (including `structuredContent`)
 *
 * For direct browser views (`?d=` / `?k=` URL fallback) the data is already
 * in `window.__TRANSIT_DATA__`, so we skip the bridge entirely.
 */
import {
	App as McpApp,
	PostMessageTransport,
} from "@modelcontextprotocol/ext-apps/app-with-deps";

const DEFAULT_MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

function extractPlanFromResult(result: unknown): PlanData | undefined {
	if (!result || typeof result !== "object") return undefined;
	const sc = (result as { structuredContent?: unknown }).structuredContent as
		| Partial<PlanData>
		| undefined;
	if (!sc || typeof sc !== "object") return undefined;
	if (!Array.isArray(sc.options) && !Array.isArray(sc.legGroups))
		return undefined;
	return sc as PlanData;
}

function bridgeBoot(
	plan: PlanData,
	locale: string | undefined,
): IframeBootstrap {
	const lang: "ja" | "en" = locale?.startsWith("en") ? "en" : "ja";
	return {
		plan,
		attribution: {
			feeds: [],
			operators: [],
			mapAttribution:
				'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://openfreemap.org">OpenFreeMap</a>',
		},
		mapStyleUrl: DEFAULT_MAP_STYLE,
		lang,
	};
}

async function connectAppBridge(
	render: (boot: IframeBootstrap) => void,
): Promise<void> {
	// We're not a parent — only run when sandboxed inside a host iframe.
	if (typeof window === "undefined" || window.parent === window) return;
	try {
		const app = new McpApp(
			{ name: "transit-mcp-widget", version: "0.1.0" },
			// We don't expose any in-iframe tools; the host owns the server.
			{},
		);
		const onResult = (params: unknown) => {
			const plan = extractPlanFromResult(params);
			if (plan) {
				const locale = app.getHostContext()?.locale;
				render(bridgeBoot(plan, locale));
			}
		};
		app.addEventListener("toolresult", onResult);
		// `connect()` defaults to PostMessageTransport(window.parent,
		// window.parent) when called without args; we pass it explicitly to
		// be defensive across SDK versions.
		await app.connect(new PostMessageTransport(window.parent, window.parent));
	} catch (err) {
		console.warn("MCP App bridge connect failed:", err);
	}
}

function bootstrap(): void {
	const container = document.getElementById("app");
	if (!container) return;

	const root = createRoot(container);
	const render = (boot: IframeBootstrap) => root.render(<App boot={boot} />);

	const directBoot = window.__TRANSIT_DATA__;
	if (directBoot) {
		render(directBoot);
		return;
	}

	// Placeholder until the host sends us the tool result.
	container.textContent = "Waiting for plan data…";
	void connectAppBridge(render);
}

bootstrap();
