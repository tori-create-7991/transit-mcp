/**
 * Convert a walk polyline (lat/lon points) into a compact list of
 * turn instructions suitable for displaying in the route card.
 */

export type WalkTurn = {
	/** Distance from start of walk to this turn point, meters (rounded). */
	distanceMeters: number;
	/** Turn direction. "straight" turns are filtered out before returning. */
	direction: "left" | "right" | "sharp-left" | "sharp-right";
};

const RADIUS_METERS = 6_371_000;

function toRad(deg: number): number {
	return (deg * Math.PI) / 180;
}

export function haversineMeters(
	a: { lat: number; lon: number },
	b: { lat: number; lon: number },
): number {
	const dLat = toRad(b.lat - a.lat);
	const dLon = toRad(b.lon - a.lon);
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
	return 2 * RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Bearing in degrees [0, 360). 0 = north, 90 = east. */
export function bearing(
	a: { lat: number; lon: number },
	b: { lat: number; lon: number },
): number {
	const phi1 = toRad(a.lat);
	const phi2 = toRad(b.lat);
	const deltaLambda = toRad(b.lon - a.lon);
	const y = Math.sin(deltaLambda) * Math.cos(phi2);
	const x =
		Math.cos(phi1) * Math.sin(phi2) -
		Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
	const theta = Math.atan2(y, x);
	return ((theta * 180) / Math.PI + 360) % 360;
}

/**
 * Compute turn list from a walk polyline. For each adjacent triple (A,B,C), the
 * bearing change at B is bearing(B to C) - bearing(A to B). Negative changes
 * are displayed as right turns to match the route card's turn convention.
 */
export function turnsFromPolyline(
	polyline: { lat: number; lon: number }[],
): WalkTurn[] {
	if (polyline.length < 3) return [];
	const turns: WalkTurn[] = [];
	let cumulativeMeters = 0;
	for (let i = 1; i < polyline.length - 1; i++) {
		const a = polyline[i - 1]!;
		const b = polyline[i]!;
		const c = polyline[i + 1]!;
		cumulativeMeters += haversineMeters(a, b);
		const b1 = bearing(a, b);
		const b2 = bearing(b, c);
		const diff = ((b2 - b1 + 540) % 360) - 180;
		const abs = Math.abs(diff);
		if (abs < 30) continue;
		const direction =
			diff < 0
				? abs >= 120
					? "sharp-right"
					: "right"
				: abs >= 120
					? "sharp-left"
					: "left";
		turns.push({
			distanceMeters: Math.round(cumulativeMeters),
			direction,
		});
	}
	return turns;
}
