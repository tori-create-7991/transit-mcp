/**
 * Footer attribution band. Required by transit feed terms (per design.md
 * section 5) and by MapLibre/tile providers. The full list of feeds /
 * operators can exceed 200 entries, so the data line collapses by default
 * and expands on user click — full text remains in the DOM (no `hidden`
 * attribute games) so screen readers and machine scrapers still see it.
 */

import { type ReactElement, useState } from "react";
import type { Dict } from "../i18n/ja.js";

type T = (key: keyof Dict, vars?: Record<string, string | number>) => string;

export function Attribution(props: {
	feeds: string[];
	operators: string[];
	mapAttribution: string;
	t: T;
}): ReactElement {
	const { feeds, operators, mapAttribution, t } = props;
	const dataLines = [...feeds, ...operators].filter(Boolean);
	const [expanded, setExpanded] = useState(false);
	const count = dataLines.length;
	const hasData = count > 0;

	return (
		<footer className="attribution">
			<div className="attribution__row">
				<span className="attribution__label">{t("attribution.data")}:</span>
				<span className="attribution__value">
					{hasData ? t("attribution.providers_count", { count }) : "—"}
				</span>
				{hasData && (
					<button
						type="button"
						className="attribution__toggle"
						aria-expanded={expanded}
						onClick={() => setExpanded((v) => !v)}
					>
						{expanded ? t("attribution.hide") : t("attribution.show")}
					</button>
				)}
			</div>
			{hasData && expanded && (
				<div className="attribution__details" role="region">
					{dataLines.join(" · ")}
				</div>
			)}
			<div className="attribution__row">
				<span className="attribution__label">{t("attribution.map")}:</span>
				<span
					className="attribution__value"
					// MapLibre / OpenFreeMap attribution may include simple <a> tags.
					// biome-ignore lint/security/noDangerouslySetInnerHtml: server-controlled, sanitized by static config
					dangerouslySetInnerHTML={{ __html: mapAttribution }}
				/>
			</div>
		</footer>
	);
}
