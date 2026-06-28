import type { ReactElement } from "react";
import type { Dict } from "../i18n/ja.js";
import type { PlanOptionUi } from "../types.js";

type T = (key: keyof Dict, vars?: Record<string, string | number>) => string;

function transitLines(option: PlanOptionUi): string[] {
	return Array.from(
		new Set(
			option.legs
				.filter((leg) => leg.mode !== "walk")
				.map((leg) => leg.line ?? leg.mode),
		),
	);
}

export function RouteCompareTable(props: {
	options: PlanOptionUi[];
	activeIdx: number;
	onSelect: (idx: number) => void;
	t: T;
}): ReactElement {
	const { options, activeIdx, onSelect, t } = props;

	return (
		<table className="route-compare">
			<thead>
				<tr>
					<th>#</th>
					<th>{t("route.duration")}</th>
					<th>{t("route.transfers")}</th>
					<th>{t("route.fare")}</th>
					<th>{t("compare.lines")}</th>
				</tr>
			</thead>
			<tbody>
				{options.map((option, idx) => {
					const fareYen = option.fareIcYen ?? option.fareYen;
					const isActive = idx === activeIdx;
					return (
						<tr
							// biome-ignore lint/suspicious/noArrayIndexKey: routes are ordered & stable per payload
							key={idx}
							className={`route-compare__row${
								isActive ? " route-compare__row--active" : ""
							}`}
							onClick={() => onSelect(idx)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									onSelect(idx);
								}
							}}
							tabIndex={0}
							role="button"
							aria-pressed={isActive}
						>
							<td>#{idx + 1}</td>
							<td>
								{t("route.minutes", {
									count: Math.round(option.durationSec / 60),
								})}
							</td>
							<td>{t("route.transfers_count", { count: option.transfers })}</td>
							<td>
								{fareYen !== undefined
									? t("route.fare_yen", { yen: fareYen })
									: t("route.no_fare")}
							</td>
							<td>{transitLines(option).join(" / ")}</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}
