import { describe, expect, it } from "vitest";
import { t } from "../src/i18n.js";

describe("i18n t()", () => {
	describe("ja dictionary", () => {
		it.each<[string, string]>([
			["error_not_found", "見つかりませんでした"],
			["error_server", "サーバーエラーが発生しました"],
			["error_invalid_input", "入力が不正です"],
			["error_rate_limited", "アクセスが集中しています"],
		])("returns ja string for key %s", (key, expected) => {
			expect(t(key, "ja")).toBe(expected);
		});
	});

	describe("en dictionary", () => {
		it.each<[string, string]>([
			["error_not_found", "Not found"],
			["error_server", "Server error"],
			["error_invalid_input", "Invalid input"],
			["error_rate_limited", "Rate limited"],
		])("returns en string for key %s", (key, expected) => {
			expect(t(key, "en")).toBe(expected);
		});
	});

	describe("variable interpolation", () => {
		it("replaces {{name}} placeholder in ja", () => {
			expect(
				t("route_summary_template", "ja", { from: "渋谷", to: "東京" }),
			).toBe("渋谷 から 東京 までの経路");
		});

		it("replaces {{name}} placeholder in en", () => {
			expect(
				t("route_summary_template", "en", { from: "Shibuya", to: "Tokyo" }),
			).toBe("Route from Shibuya to Tokyo");
		});

		it("replaces numeric vars", () => {
			expect(t("departures_count", "en", { count: 3 })).toBe(
				"3 upcoming departures",
			);
		});

		it("leaves unknown placeholders untouched", () => {
			expect(t("route_summary_template", "ja", { from: "A" })).toContain(
				"{{to}}",
			);
		});
	});

	describe("missing keys", () => {
		it("returns the key itself when key is unknown (ja)", () => {
			expect(t("___nonexistent___", "ja")).toBe("___nonexistent___");
		});

		it("returns the key itself when key is unknown (en)", () => {
			expect(t("___nonexistent___", "en")).toBe("___nonexistent___");
		});
	});
});
