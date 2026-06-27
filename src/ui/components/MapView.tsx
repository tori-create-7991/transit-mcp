/**
 * Mounts a MapLibre GL map with optional route geometry overlay.
 *
 * When `map` is provided, polylines (one per planner segment) are added
 * as a GeoJSON source and the view is fit to the bounds. Transit
 * segments get a solid blue line; walks render as a dashed gray line.
 * Origin / destination / transfer points are placed as small markers.
 */

import { type ReactElement, useEffect, useRef } from "react";
import type { PlanMapData } from "../types.js";

export function MapView(props: {
	mapStyleUrl: string;
	map?: PlanMapData;
}): ReactElement {
	const { mapStyleUrl, map } = props;
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<unknown>(null);

	useEffect(() => {
		if (!containerRef.current) return;
		let cancelled = false;
		void import("maplibre-gl").then((mlib) => {
			if (cancelled || !containerRef.current) return;
			const Map = mlib.Map;
			const m = new Map({
				container: containerRef.current,
				style: mapStyleUrl,
				center: [139.7671, 35.6812],
				zoom: 10,
				attributionControl: false,
			});
			mapRef.current = m;
			m.on("load", () => {
				if (!map) return;

				const transitFeatures = map.segments
					.filter((s) => s.kind !== "walk" && s.polyline.length >= 2)
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
						paint: { "line-color": "#0a6cff", "line-width": 5 },
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
								: "#555";
					new Marker({ color }).setLngLat([p.lon, p.lat]).addTo(m);
				}

				if (map.bounds) {
					m.fitBounds(
						[
							[map.bounds.minLon, map.bounds.minLat],
							[map.bounds.maxLon, map.bounds.maxLat],
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
			const m = mapRef.current as { remove?: () => void } | null;
			if (m?.remove) m.remove();
			mapRef.current = null;
		};
	}, [mapStyleUrl, map]);

	return <div className="map-view" ref={containerRef} />;
}
