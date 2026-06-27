/**
 * Japanese UI chrome dictionary for the iframe.
 *
 * Server-side `src/i18n.ts` covers the LLM-facing summary strings; this
 * file covers only the labels, buttons, and error text rendered inside
 * the iframe itself.
 */

export type Dict = {
	"app.title": string;
	"route.duration": string;
	"route.transfers": string;
	"route.fare": string;
	"route.depart": string;
	"route.arrive": string;
	"route.minutes": string;
	"route.transfers_count": string;
	"route.fare_yen": string;
	"route.no_fare": string;
	"leg.platform": string;
	"leg.walk": string;
	"lang.toggle.ja": string;
	"lang.toggle.en": string;
	"attribution.data": string;
	"attribution.map": string;
	"error.no_data": string;
};

export const ja: Dict = {
	"app.title": "経路案内",
	"route.duration": "所要時間",
	"route.transfers": "乗換",
	"route.fare": "運賃",
	"route.depart": "出発",
	"route.arrive": "到着",
	"route.minutes": "{count}分",
	"route.transfers_count": "{count}回",
	"route.fare_yen": "{yen}円",
	"route.no_fare": "—",
	"leg.platform": "ホーム",
	"leg.walk": "徒歩",
	"lang.toggle.ja": "日本語",
	"lang.toggle.en": "English",
	"attribution.data": "データ",
	"attribution.map": "地図",
	"error.no_data": "表示できるデータがありません",
};
