/**
 * Per-leg option chip picker for multi-leg journeys.
 *
 * Renders one row per leg group; each row is a horizontal strip of compact
 * "option chips" (`◯ 山手線 13分 ¥168`). Clicking a chip swaps the
 * selected option for that leg, and `onChange` fires with the new index
 * array so the parent can recompute the combined totals + map.
 */

import type { ReactElement } from "react";
import type { Dict } from "../i18n/ja.js";
import type { PlanLegGroupUi, PlanOptionUi } from "../types.js";

type T = (key: keyof Dict, vars?: Record<string, string | number>) => string;

function optionLabel(opt: PlanOptionUi, t: T): string {
	const minutes = Math.round(opt.durationSec / 60);
	const firstLine = opt.legs.find((l) => l.line)?.line ?? t("leg.walk");
	const fareLabel =
		opt.fareYen !== undefined
			? ` · ${t("route.fare_yen", { yen: opt.fareYen })}`
			: "";
	return `${firstLine} · ${t("route.minutes", { count: minutes })}${fareLabel}`;
}

export function LegPicker(props: {
	groups: PlanLegGroupUi[];
	selectedIndices: number[];
	onChange: (next: number[]) => void;
	t: T;
}): ReactElement {
	const { groups, selectedIndices, onChange, t } = props;
	return (
		<div
			className="leg-picker"
			role="region"
			aria-label={t("multi.pick_option")}
		>
			{groups.map((g, i) => {
				const selected = selectedIndices[i] ?? 0;
				return (
					<section className="leg-picker__row" key={g.index}>
						<header className="leg-picker__row-header">
							<span className="leg-picker__row-label">
								{t("multi.leg_label", { n: i + 1, from: g.from, to: g.to })}
							</span>
							{g.note ? (
								<span className="leg-picker__row-note">{g.note}</span>
							) : null}
						</header>
						<div className="leg-picker__chips" role="radiogroup">
							{g.options.map((opt, j) => {
								const active = selected === j;
								return (
									<button
										// biome-ignore lint/suspicious/noArrayIndexKey: option list is stable per payload
										key={j}
										type="button"
										role="radio"
										aria-checked={active}
										className={`leg-picker__chip${active ? " leg-picker__chip--active" : ""}`}
										onClick={() => {
											const next = [...selectedIndices];
											next[i] = j;
											onChange(next);
										}}
									>
										{optionLabel(opt, t)}
									</button>
								);
							})}
						</div>
					</section>
				);
			})}
		</div>
	);
}
