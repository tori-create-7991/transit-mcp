/**
 * UI chrome i18n entry. Resolves language from
 *   1. `?lang=ja|en` query param
 *   2. `localStorage.transit_lang`
 *   3. `navigator.language`
 *   4. default "ja"
 *
 * `t(key, vars?)` returns the dict string with `{name}` placeholder
 * interpolation. Unknown keys return the key itself.
 */

import { en } from "./en.js";
import { type Dict, ja } from "./ja.js";

export type UiLang = "ja" | "en";

const DICTS: Record<UiLang, Dict> = { ja, en };

const LS_KEY = "transit_lang";

export function detectLang(): UiLang {
	if (typeof window === "undefined") return "ja";
	try {
		const params = new URLSearchParams(window.location.search);
		const q = params.get("lang");
		if (q === "ja" || q === "en") return q;
	} catch {
		/* ignore */
	}
	try {
		const stored = window.localStorage?.getItem(LS_KEY);
		if (stored === "ja" || stored === "en") return stored;
	} catch {
		/* ignore */
	}
	try {
		const nav = window.navigator?.language ?? "";
		if (nav.startsWith("ja")) return "ja";
		if (nav.startsWith("en")) return "en";
	} catch {
		/* ignore */
	}
	return "ja";
}

export function persistLang(lang: UiLang): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage?.setItem(LS_KEY, lang);
	} catch {
		/* ignore */
	}
}

export function makeT(
	lang: UiLang,
): (key: keyof Dict, vars?: Record<string, string | number>) => string {
	const dict = DICTS[lang];
	return (key, vars) => {
		const tmpl = dict[key] ?? key;
		if (!vars) return tmpl;
		return tmpl.replace(/\{(\w+)\}/g, (m, name: string) => {
			const v = vars[name];
			return v === undefined ? m : String(v);
		});
	};
}
