/**
 * Renders a single itinerary: duration / transfers / fare header and
 * an ordered list of legs.
 */

import type { ReactElement } from "react";
import type { Dict } from "../i18n/ja.js";
import type { PlanOptionUi } from "../types.js";

type T = (key: keyof Dict, vars?: Record<string, string | number>) => string;

export function RouteCard(props: {
	option: PlanOptionUi;
	rank: number;
	t: T;
	active?: boolean;
	onSelect?: () => void;
}): ReactElement {
	const { option, rank, t, active, onSelect } = props;
	const minutes = Math.round(option.durationSec / 60);
	return (
		<article
			className={`route-card${active ? " route-card--active" : ""}`}
			data-rank={rank}
			onClick={onSelect}
			onKeyDown={(e) => {
				if (onSelect && (e.key === "Enter" || e.key === " ")) {
					e.preventDefault();
					onSelect();
				}
			}}
			tabIndex={onSelect ? 0 : -1}
			role={onSelect ? "button" : undefined}
			aria-pressed={onSelect ? active : undefined}
		>
			<header className="route-card__header">
				<span className="route-card__rank">#{rank}</span>
				<dl className="route-card__metrics">
					<div>
						<dt>{t("route.duration")}</dt>
						<dd>{t("route.minutes", { count: minutes })}</dd>
					</div>
					<div>
						<dt>{t("route.transfers")}</dt>
						<dd>{t("route.transfers_count", { count: option.transfers })}</dd>
					</div>
					<div>
						<dt>{t("route.fare")}</dt>
						<dd>
							{option.fareYen !== undefined
								? t("route.fare_yen", { yen: option.fareYen })
								: t("route.no_fare")}
						</dd>
					</div>
				</dl>
			</header>
			<ol className="route-card__legs">
				{option.legs.map((leg, idx) => (
					<li
						className="route-card__leg"
						data-mode={leg.mode}
						// biome-ignore lint/suspicious/noArrayIndexKey: leg list is fully derived
						key={idx}
					>
						<div className="route-card__leg-line">
							{leg.mode === "walk" ? t("leg.walk") : (leg.line ?? leg.mode)}
						</div>
						<div className="route-card__leg-od">
							<span>{leg.fromName}</span>
							<span aria-hidden="true">→</span>
							<span>{leg.toName}</span>
						</div>
						<div className="route-card__leg-time">
							{formatSecs(leg.departSec)} → {formatSecs(leg.arriveSec)}
							{leg.platform !== undefined ? (
								<span className="route-card__leg-platform">
									{" "}
									· {t("leg.platform")} {leg.platform}
								</span>
							) : null}
						</div>
					</li>
				))}
			</ol>
		</article>
	);
}

function formatSecs(secs: number): string {
	const h = Math.floor(secs / 3600) % 24;
	const m = Math.floor(secs / 60) % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
