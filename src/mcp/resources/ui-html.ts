/**
 * `renderUiHtml(data, attribution, mapStyleUrl, lang)` returns the iframe
 * HTML by substituting the bootstrap payload into the pre-built
 * `src/ui/dist/plan.html` template (produced by `pnpm build:ui`).
 *
 * The template embeds a JS bundle (React + MapLibre + our components) and
 * the MapLibre + custom CSS inline, so the iframe has zero external
 * fetches. Bootstrap data is injected via:
 *
 *   <script>window.__TRANSIT_DATA__ = ___PLACEHOLDER___</script>
 *
 * The placeholder is replaced with `JSON.stringify(bootstrap)` so the JSON
 * embeds safely. We additionally escape `</` to `<\\/` to defeat any
 * accidental script-close inside string values.
 */

import type {
	AttributionData,
	IframeBootstrap,
	PlanData,
} from "../../ui/types.js";
// Inlined at build time so the Worker bundle ships with the HTML. Using
// `?raw` style imports would couple us to a specific bundler — esbuild
// in our Worker pipeline does not support that — so we read the file
// content via a generated helper module (`./ui-html.generated.ts`),
// which is overwritten by `pnpm build:ui`. We provide a stub fallback
// when the build artifact is missing so tests can still run.
import { PLAN_HTML_TEMPLATE } from "./ui-html.generated.js";

const PLACEHOLDER = "___PLACEHOLDER___";

export function renderUiHtml(
	data: PlanData,
	attribution: AttributionData,
	mapStyleUrl: string,
	lang: "ja" | "en",
): string {
	const boot: IframeBootstrap = {
		plan: data,
		attribution,
		mapStyleUrl,
		lang,
	};
	const json = JSON.stringify(boot).replace(/<\//g, "<\\/");
	return PLAN_HTML_TEMPLATE.replace(PLACEHOLDER, json);
}

export { PLAN_HTML_TEMPLATE };
