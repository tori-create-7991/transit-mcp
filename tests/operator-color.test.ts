import { describe, expect, it } from "vitest";
import { operatorColor } from "../src/ui/components/MapView.js";

describe("operatorColor", () => {
	it("returns JR green for jreast", () => {
		expect(operatorColor("jreast")).toBe("#16a34a");
	});

	it("returns Tokyo Metro blue for tokyometro", () => {
		expect(operatorColor("tokyometro")).toBe("#1d3a85");
	});

	it("returns Toei green for toei", () => {
		expect(operatorColor("toei")).toBe("#0a8a72");
	});

	it("returns private railway orange for keio", () => {
		expect(operatorColor("keio")).toBe("#f07c1c");
	});

	it("returns undefined when operator id is missing", () => {
		expect(operatorColor(undefined)).toBeUndefined();
	});
});
