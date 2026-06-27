/**
 * Footer attribution band. Required by transit feed terms (per design.md
 * section 5) and by MapLibre/tile providers — always rendered, never
 * collapsed.
 */

import type { ReactElement } from "react";
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
	return (
		<footer className="attribution">
			<div className="attribution__row">
				<span className="attribution__label">{t("attribution.data")}:</span>
				<span className="attribution__value">
					{dataLines.length > 0 ? dataLines.join(" · ") : "—"}
				</span>
			</div>
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
