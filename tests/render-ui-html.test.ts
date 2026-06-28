import { describe, expect, it } from "vitest";
import { renderUiHtml } from "../src/mcp/resources/ui-html";

describe("renderUiHtml", () => {
	it("injects both light and dark map style URLs into the bootstrap payload", () => {
		const html = renderUiHtml(
			{ summary: "ok", options: [] },
			{ feeds: [], operators: [], mapAttribution: "" },
			"https://tiles.example.test/light.json",
			"https://tiles.example.test/dark.json",
			"en",
		);

		expect(html).toContain('"mapStyleUrl":"https://tiles.example.test/light.json"');
		expect(html).toContain(
			'"mapStyleUrlDark":"https://tiles.example.test/dark.json"',
		);
	});
});
