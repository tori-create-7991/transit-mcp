/**
 * Mounts a MapLibre GL map. The map style URL is provided by the server
 * (Worker env `MAP_STYLE_URL`). Geometry lines, when present, are added
 * as a stable `route-geometry` source/layer so future updates can swap
 * features without re-creating the map.
 *
 * Geometry is optional — the planner currently does not return polylines,
 * so the map falls back to a centered Tokyo view.
 */

import { type ReactElement, useEffect, useRef } from "react";

type LineString = {
	type: "LineString";
	coordinates: [number, number][];
};

export function MapView(props: {
	mapStyleUrl: string;
	geometry?: LineString[];
}): ReactElement {
	const { mapStyleUrl, geometry } = props;
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<unknown>(null);

	useEffect(() => {
		if (!containerRef.current) return;
		// Dynamic import keeps MapLibre out of any future SSR path and makes
		// the dependency obvious in the bundle graph.
		let cancelled = false;
		void import("maplibre-gl").then((mlib) => {
			if (cancelled || !containerRef.current) return;
			const Map = mlib.Map;
			const map = new Map({
				container: containerRef.current,
				style: mapStyleUrl,
				center: [139.7671, 35.6812],
				zoom: 10,
				attributionControl: false,
			});
			mapRef.current = map;
			map.on("load", () => {
				if (!geometry || geometry.length === 0) return;
				map.addSource("route-geometry", {
					type: "geojson",
					data: {
						type: "FeatureCollection",
						features: geometry.map((g) => ({
							type: "Feature",
							geometry: g,
							properties: {},
						})),
					},
				});
				map.addLayer({
					id: "route-geometry-line",
					type: "line",
					source: "route-geometry",
					paint: {
						"line-color": "#0a6cff",
						"line-width": 4,
					},
				});
			});
		});
		return () => {
			cancelled = true;
			const map = mapRef.current as { remove?: () => void } | null;
			if (map?.remove) map.remove();
			mapRef.current = null;
		};
	}, [mapStyleUrl, geometry]);

	return <div className="map-view" ref={containerRef} />;
}
