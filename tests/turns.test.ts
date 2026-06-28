import { describe, expect, it } from "vitest";
import { turnsFromPolyline } from "../src/ui/turns.js";

describe("turnsFromPolyline", () => {
	it("returns a right turn for an L-shaped south then east path", () => {
		const turns = turnsFromPolyline([
			{ lat: 35.0002, lon: 139 },
			{ lat: 35, lon: 139 },
			{ lat: 35, lon: 139.0002 },
		]);

		expect(turns).toHaveLength(1);
		expect(turns[0]?.direction).toBe("right");
		expect(turns[0]?.distanceMeters).toBeGreaterThan(0);
	});

	it("filters out straight three-point paths", () => {
		expect(
			turnsFromPolyline([
				{ lat: 35, lon: 139 },
				{ lat: 35.0001, lon: 139 },
				{ lat: 35.0002, lon: 139 },
			]),
		).toEqual([]);
	});

	it("returns multiple turns for a zigzag path", () => {
		const turns = turnsFromPolyline([
			{ lat: 35, lon: 139 },
			{ lat: 35.0001, lon: 139.0001 },
			{ lat: 35, lon: 139.0002 },
			{ lat: 35.0001, lon: 139.0003 },
			{ lat: 35, lon: 139.0004 },
		]);

		expect(turns.length).toBeGreaterThanOrEqual(2);
	});

	it("returns no turns for paths with fewer than three points", () => {
		expect(
			turnsFromPolyline([
				{ lat: 35, lon: 139 },
				{ lat: 35.0001, lon: 139.0001 },
			]),
		).toEqual([]);
	});
});
