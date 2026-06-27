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
	error_station_not_found: "該当する駅が見つかりません",
	error_place_not_found: "該当する地点が見つかりません",
	attribution_label: "データ提供",
	loading: "読み込み中",
	search_places_summary: "{{count}} 件の候補が見つかりました",
	search_places_empty: "候補が見つかりませんでした",
	station_summary: "{{name}}（{{routeCount}} 路線・{{platformCount}} ホーム）",
	departures_summary: "{{name}} の今後 {{count}} 本の発車",
	departures_empty: "{{name}} に発車情報がありません",
	plan_summary: "{{count}} 件の経路。最速は {{route}} で {{minutes}} 分",
	plan_summary_no_route: "経路が見つかりませんでした",
	multi_plan_summary:
		"{{count}} 区間の連結経路：合計 {{minutes}} 分・乗換 {{transfers}} 回",
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
	error_station_not_found: "Station not found",
	error_place_not_found: "Place not found",
	attribution_label: "Data provided by",
	loading: "Loading",
	search_places_summary: "{{count}} places found",
	search_places_empty: "No matching places",
	station_summary:
		"{{name}} ({{routeCount}} routes, {{platformCount}} platforms)",
	departures_summary: "{{count}} upcoming departures at {{name}}",
	departures_empty: "No departures available at {{name}}",
	plan_summary: "{{count}} routes found, fastest {{minutes}} min via {{route}}",
	plan_summary_no_route: "No route found",
	multi_plan_summary:
		"{{count}}-leg combined journey: {{minutes}} min total, {{transfers}} transfers",
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
