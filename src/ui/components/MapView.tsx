/**
 * Mounts a MapLibre GL map with optional route geometry overlay.
 *
 * When `map` is provided, polylines (one per planner segment) are added
 * as a GeoJSON source and the view is fit to the bounds. Transit
 * segments use route colors when available; walks render as a dashed gray line.
 * Origin / destination / transfer points are placed as small markers.
 *
 * `focusBounds` (optional) animates the camera to that bbox without
 * re-creating the map — used when the user clicks a route leg to zoom
 * onto a single segment. Clearing it (`undefined`) animates back to
 * the full plan bounds.
 */

import { type ReactElement, useEffect, useRef, useState } from "react";
import type { PlanMapBounds, PlanMapData } from "../types.js";

type MapLibreMap = {
	on: (
		ev: "load" | "error" | "styledata",
		cb: (e?: { error?: Error }) => void,
	) => void;
	addSource: (id: string, src: unknown) => void;
	addLayer: (layer: unknown) => void;
	fitBounds: (
		b: [[number, number], [number, number]],
		opts: { padding?: number; duration?: number; maxZoom?: number },
	) => void;
	resize: () => void;
	remove: () => void;
};

export function operatorColor(operatorId?: string): string | undefined {
	if (!operatorId) return undefined;
	const id = operatorId.toLowerCase();
	if (id.startsWith("jr")) return "#16a34a";
	if (id === "tokyometro" || id === "metro") return "#1d3a85";
	if (id === "toei") return "#0a8a72";
	if (
		["keio", "odakyu", "tokyu", "keisei", "keikyu", "seibu", "tobu"].includes(
			id,
		)
	) {
		return "#f07c1c";
	}
	if (id === "bus") return "#666";
	if (id === "airport") return "#7c3aed";
	return undefined;
}

export function MapView(props: {
	mapStyleUrl: string;
	mapStyleUrlDark?: string;
	darkMode?: boolean;
	map?: PlanMapData;
	focusBounds?: PlanMapBounds;
}): ReactElement {
	const { mapStyleUrl, mapStyleUrlDark, darkMode, map, focusBounds } = props;
	const effectiveStyle =
		darkMode && mapStyleUrlDark ? mapStyleUrlDark : mapStyleUrl;
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<MapLibreMap | null>(null);
	const roRef = useRef<ResizeObserver | null>(null);
	const loadedRef = useRef(false);
	const [initError, setInitError] = useState<string | null>(null);
	const [status, setStatus] = useState<string>("boot");

	useEffect(() => {
		if (!containerRef.current) return;
		let cancelled = false;
		setInitError(null);
		setStatus("importing maplibre-gl");
		void import("maplibre-gl")
			.catch((err: unknown) => {
				const msg = err instanceof Error ? err.message : String(err);
				console.error("[transit-mcp] maplibre-gl import failed:", err);
				setInitError(`Map library failed to load: ${msg}`);
				return null;
			})
			.then((mlib) => {
				if (!mlib || cancelled || !containerRef.current) return;
				setStatus("constructing map");
				const rect = containerRef.current.getBoundingClientRect();
				console.info(
					`[transit-mcp] map container ${rect.width}x${rect.height}`,
				);
				let m: MapLibreMap;
				try {
					m = new mlib.Map({
						container: containerRef.current,
						style: effectiveStyle,
						center: [139.7671, 35.6812],
						zoom: 10,
						attributionControl: false,
					}) as unknown as MapLibreMap;
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					console.error("[transit-mcp] MapLibre init threw:", err);
					setInitError(
						`Map init failed (${rect.width}x${rect.height}): ${msg}`,
					);
					return;
				}
				setStatus("awaiting style + tiles");
				m.on("error", (e) => {
					console.error("[transit-mcp] MapLibre runtime error:", e?.error ?? e);
					const msg = e?.error?.message ?? "unknown";
					if (!loadedRef.current) {
						setInitError(`Map runtime error: ${msg}`);
					} else {
						setStatus(`runtime err: ${msg}`);
					}
				});
				mapRef.current = m;
				loadedRef.current = false;
				// Auto-resize when the container size changes. ChatGPT MCP Apps
				// SDK auto-resizes the iframe based on content; the map container
				// may start small and grow later, so watch for it.
				const ro =
					typeof ResizeObserver !== "undefined"
						? new ResizeObserver(() => {
								try {
									m.resize();
								} catch {}
							})
						: null;
				if (ro && containerRef.current) ro.observe(containerRef.current);
				roRef.current = ro;
				m.on("load", () => {
					loadedRef.current = true;
					setStatus("loaded");
					try {
						m.resize();
					} catch {}
					if (!map) return;

					const transitFeatures = map.segments
						.filter((s) => s.kind !== "walk" && s.polyline.length >= 2)
						.map((s) => {
							const color = s.color
								? s.color.startsWith("#")
									? s.color
									: `#${s.color}`
								: null;
							return {
								type: "Feature" as const,
								geometry: {
									type: "LineString" as const,
									coordinates: s.polyline.map(
										(p) => [p.lon, p.lat] as [number, number],
									),
								},
								properties: color ? { kind: s.kind, color } : { kind: s.kind },
							};
						});
					const walkFeatures = map.segments
						.filter((s) => s.kind === "walk" && s.polyline.length >= 2)
						.map((s) => ({
							type: "Feature" as const,
							geometry: {
								type: "LineString" as const,
								coordinates: s.polyline.map(
									(p) => [p.lon, p.lat] as [number, number],
								),
							},
							properties: { kind: s.kind },
						}));

					if (transitFeatures.length > 0) {
						m.addSource("route-transit", {
							type: "geojson",
							data: { type: "FeatureCollection", features: transitFeatures },
						});
						m.addLayer({
							id: "route-transit-line",
							type: "line",
							source: "route-transit",
							paint: {
								"line-color": [
									"case",
									["has", "color"],
									["get", "color"],
									"#0a6cff",
								],
								"line-width": 5,
							},
							layout: { "line-cap": "round", "line-join": "round" },
						});
					}
					if (walkFeatures.length > 0) {
						m.addSource("route-walk", {
							type: "geojson",
							data: { type: "FeatureCollection", features: walkFeatures },
						});
						m.addLayer({
							id: "route-walk-line",
							type: "line",
							source: "route-walk",
							paint: {
								"line-color": "#888",
								"line-width": 3,
								"line-dasharray": [1, 1.5],
							},
							layout: { "line-cap": "round", "line-join": "round" },
						});
					}

					const Marker = mlib.Marker;
					for (const p of map.points) {
						const role = p.role ?? "stop";
						const color =
							role === "origin"
								? "#16a34a"
								: role === "destination"
									? "#dc2626"
									: (operatorColor(p.operatorId) ?? "#555");
						const marker = new Marker({ color })
							.setLngLat([p.lon, p.lat])
							.addTo(m as never);
						const title = [p.name, p.operatorId].filter(Boolean).join(" / ");
						if (title) marker.getElement().setAttribute("title", title);
					}

					const initial = focusBounds ?? map.bounds;
					if (initial) {
						m.fitBounds(
							[
								[initial.minLon, initial.minLat],
								[initial.maxLon, initial.maxLat],
							],
							{ padding: 40, duration: 0 },
						);
					} else if (map.points.length > 0) {
						const lats = map.points.map((p) => p.lat);
						const lons = map.points.map((p) => p.lon);
						m.fitBounds(
							[
								[Math.min(...lons), Math.min(...lats)],
								[Math.max(...lons), Math.max(...lats)],
							],
							{ padding: 40, duration: 0 },
						);
					}
				});
			});
		return () => {
			cancelled = true;
			const ro = roRef.current;
			if (ro) ro.disconnect();
			roRef.current = null;
			const m = mapRef.current;
			if (m?.remove) m.remove();
			mapRef.current = null;
			loadedRef.current = false;
		};
		// Intentionally exclude `focusBounds` from deps: focus changes are
		// handled by the second effect below without re-mounting the map.
		// biome-ignore lint/correctness/useExhaustiveDependencies: handled in separate effect
	}, [effectiveStyle, map, darkMode]);

	// Animate camera to focusBounds (or back to overall bounds) without
	// re-creating the map. Runs after the load handler has populated layers.
	useEffect(() => {
		const m = mapRef.current;
		if (!m || !loadedRef.current) return;
		const target = focusBounds ?? map?.bounds;
		if (!target) return;
		m.fitBounds(
			[
				[target.minLon, target.minLat],
				[target.maxLon, target.maxLat],
			],
			{ padding: 60, duration: 600, maxZoom: 16 },
		);
	}, [focusBounds, map?.bounds]);

	return (
		<div className="map-view" ref={containerRef}>
			{initError ? (
				<div
					style={{
						position: "absolute",
						inset: 0,
						padding: 12,
						color: "#fff",
						background: "#7a1e1e",
						font: "12px/1.4 monospace",
						overflow: "auto",
						zIndex: 5,
					}}
				>
					<strong>Map error</strong>
					<br />
					{initError}
				</div>
			) : (
				<div
					style={{
						position: "absolute",
						top: 8,
						left: 8,
						padding: "4px 8px",
						color: "#fff",
						background: "rgba(0,0,0,0.55)",
						font: "11px/1.2 monospace",
						borderRadius: 4,
						zIndex: 5,
						pointerEvents: "none",
					}}
				>
					map: {status}
				</div>
			)}
		</div>
	);
}
