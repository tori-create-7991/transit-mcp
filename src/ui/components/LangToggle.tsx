/**
 * Fixed top-right language toggle. Persists the choice to localStorage
 * (via the parent) and highlights the active language.
 */

import type { ReactElement } from "react";
import type { UiLang } from "../i18n/index.js";
import type { Dict } from "../i18n/ja.js";

type T = (key: keyof Dict, vars?: Record<string, string | number>) => string;

export function LangToggle(props: {
	lang: UiLang;
	onChange: (next: UiLang) => void;
	t: T;
}): ReactElement {
	const { lang, onChange, t } = props;
	return (
		<div className="lang-toggle" role="group" aria-label="Language">
			<button
				type="button"
				className={`lang-toggle__btn${lang === "ja" ? " is-active" : ""}`}
				onClick={() => onChange("ja")}
				aria-pressed={lang === "ja"}
			>
				{t("lang.toggle.ja")}
			</button>
			<button
				type="button"
				className={`lang-toggle__btn${lang === "en" ? " is-active" : ""}`}
				onClick={() => onChange("en")}
				aria-pressed={lang === "en"}
			>
				{t("lang.toggle.en")}
			</button>
		</div>
	);
}
