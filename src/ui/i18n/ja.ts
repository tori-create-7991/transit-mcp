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
	"route.fare_ic": string;
	"route.no_fare": string;
	"map.reset_zoom": string;
	"route.show_detail": string;
	"route.hide_detail": string;
	"route.leg_count": string;
	"live.delay_min": string;
	"live.disruption": string;
	"leg.platform": string;
	"leg.walk": string;
	"leg.headsign": string;
	"leg.depart_at": string;
	"leg.depart_in_min": string;
	"leg.duration_min": string;
	"leg.walk_meters": string;
	"turn.left": string;
	"turn.right": string;
	"turn.sharp_left": string;
	"turn.sharp_right": string;
	"turn.at_meters": string;
	"multi.leg_label": string;
	"multi.pick_option": string;
	"multi.total": string;
	"lang.toggle.ja": string;
	"lang.toggle.en": string;
	"attribution.data": string;
	"attribution.map": string;
	"attribution.providers_count": string;
	"attribution.show": string;
	"attribution.hide": string;
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
	"route.fare_ic": "IC {yen}円",
	"route.no_fare": "—",
	"map.reset_zoom": "全体表示",
	"route.show_detail": "詳細を表示",
	"route.hide_detail": "閉じる",
	"route.leg_count": "{count} 区間",
	"live.delay_min": "{minutes} 分の遅延",
	"live.disruption": "運行情報あり",
	"leg.platform": "ホーム",
	"leg.walk": "徒歩",
	"leg.headsign": "{name} 行",
	"leg.depart_at": "{time} 発",
	"leg.depart_in_min": "あと {minutes} 分",
	"leg.duration_min": "{minutes} 分",
	"leg.walk_meters": "約 {meters} m",
	"turn.left": "左",
	"turn.right": "右",
	"turn.sharp_left": "急な左",
	"turn.sharp_right": "急な右",
	"turn.at_meters": "{meters}m 先を {direction}",
	"multi.leg_label": "区間 {n}: {from} → {to}",
	"multi.pick_option": "ルートを選択",
	"multi.total": "合計",
	"lang.toggle.ja": "日本語",
	"lang.toggle.en": "English",
	"attribution.data": "データ",
	"attribution.map": "地図",
	"attribution.providers_count": "{count} 事業者",
	"attribution.show": "詳細を表示",
	"attribution.hide": "閉じる",
	"error.no_data": "表示できるデータがありません",
};
