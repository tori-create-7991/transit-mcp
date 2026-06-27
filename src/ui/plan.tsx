/**
 * Browser entry for the iframe. Reads the bootstrap payload from
 * `window.__TRANSIT_DATA__` and mounts the React tree under `#app`.
 *
 * The bootstrap payload includes the planner output, attribution data,
 * map style URL, and the host's resolved language so the iframe doesn't
 * have to re-detect anything synchronously on first paint.
 */

import { type ReactElement, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Attribution } from "./components/Attribution.js";
import { LangToggle } from "./components/LangToggle.js";
import { MapView } from "./components/MapView.js";
import { RouteCard } from "./components/RouteCard.js";
import { detectLang, makeT, persistLang, type UiLang } from "./i18n/index.js";
import type { IframeBootstrap } from "./types.js";

declare global {
	interface Window {
		__TRANSIT_DATA__?: IframeBootstrap;
	}
}

function App(props: { boot: IframeBootstrap }): ReactElement {
	const { boot } = props;
	const [lang, setLang] = useState<UiLang>(() => {
		const detected = detectLang();
		if (typeof window !== "undefined") {
			try {
				const stored = window.localStorage?.getItem("transit_lang");
				if (stored === "ja" || stored === "en") return stored;
			} catch {
				/* ignore */
			}
		}
		return detected === "ja" && boot.lang === "en" ? "en" : detected;
	});
	const t = useMemo(() => makeT(lang), [lang]);

	const onLang = (next: UiLang) => {
		setLang(next);
		persistLang(next);
	};

	const options = boot.plan.options ?? [];
	const hasData = options.length > 0;

	const [selectedIdx, setSelectedIdx] = useState(0);
	const safeIdx = Math.min(selectedIdx, Math.max(options.length - 1, 0));
	const selectedMap = options[safeIdx]?.map;

	return (
		<div className="app">
			<LangToggle lang={lang} onChange={onLang} t={t} />
			<ol className="app__routes" aria-label={t("app.title")}>
				{hasData ? (
					options.map((opt, idx) => (
						<RouteCard
							// biome-ignore lint/suspicious/noArrayIndexKey: routes are ordered & stable per payload
							key={idx}
							option={opt}
							rank={idx + 1}
							t={t}
							active={idx === safeIdx}
							onSelect={() => setSelectedIdx(idx)}
						/>
					))
				) : (
					<li className="empty-state">{t("error.no_data")}</li>
				)}
			</ol>
			<div className="app__map">
				{selectedMap ? (
					<MapView mapStyleUrl={boot.mapStyleUrl} map={selectedMap} />
				) : (
					<MapView mapStyleUrl={boot.mapStyleUrl} />
				)}
			</div>
			<Attribution
				feeds={boot.attribution.feeds}
				operators={boot.attribution.operators}
				mapAttribution={boot.attribution.mapAttribution}
				t={t}
			/>
		</div>
	);
}

function bootstrap(): void {
	const container = document.getElementById("app");
	if (!container) return;
	const boot = window.__TRANSIT_DATA__;
	if (!boot) {
		container.textContent = "No data";
		return;
	}
	const root = createRoot(container);
	root.render(<App boot={boot} />);
}

bootstrap();
