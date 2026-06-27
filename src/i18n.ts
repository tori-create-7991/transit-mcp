/**
 * Server-side i18n helper.
 *
 * `t(key, lang, vars?)` resolves a translation string from the inline
 * ja/en dictionaries and interpolates `{{name}}` placeholders with the
 * provided `vars` map.
 *
 * Behavior:
 * - Unknown keys return the key itself (so missing translations stay
 *   debuggable instead of silently rendering empty strings).
 * - Unknown placeholders are left untouched (so caller bugs surface).
 *
 * UI-side translations live separately under `src/ui/i18n/` (Phase 4).
 */

export type Lang = "ja" | "en";

type Dict = Record<string, string>;

const ja: Dict = {
	route_summary_template: "{{from}} から {{to}} までの経路",
	departures_count: "今後の発車 {{count}} 件",
	station_detail_title: "{{name}} の詳細",
	error_not_found: "見つかりませんでした",
	error_server: "サーバーエラーが発生しました",
	error_invalid_input: "入力が不正です",
	error_rate_limited: "アクセスが集中しています",
	error_upstream: "上流 API でエラーが発生しました",
	attribution_label: "データ提供",
	loading: "読み込み中",
};

const en: Dict = {
	route_summary_template: "Route from {{from}} to {{to}}",
	departures_count: "{{count}} upcoming departures",
	station_detail_title: "{{name}} details",
	error_not_found: "Not found",
	error_server: "Server error",
	error_invalid_input: "Invalid input",
	error_rate_limited: "Rate limited",
	error_upstream: "Upstream API error",
	attribution_label: "Data provided by",
	loading: "Loading",
};

const dictionaries: Record<Lang, Dict> = { ja, en };

export function t(
	key: string,
	lang: Lang,
	vars?: Record<string, string | number>,
): string {
	const dict = dictionaries[lang];
	const template = dict[key];
	if (template === undefined) {
		return key;
	}
	if (!vars) {
		return template;
	}
	return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
		const value = vars[name];
		return value === undefined ? match : String(value);
	});
}
