/**
 * Renders a single itinerary: duration / transfers / fare header, an
 * ordered list of legs, and an expandable detail panel showing per-leg
 * times, line colors (when the feed advertises one), platforms, and
 * estimated walk distance.
 *
 * The card is clickable to "select" it (used by both single- and multi-
 * leg picker views); the detail-toggle button is wired separately so a
 * click on the toggle does not bubble to select.
 */

import { type ReactElement, useState } from "react";
import type { Dict } from "../i18n/ja.js";
import { turnsFromPolyline, type WalkTurn } from "../turns.js";
import type { PlanLegUi, PlanOptionUi } from "../types.js";

type T = (key: keyof Dict, vars?: Record<string, string | number>) => string;

const WALK_SPEED_M_PER_MIN = 80;
const JST_OFFSET_SEC = 9 * 3600;
const DEPARTURE_GRACE_SEC = 5 * 60;
const DEPARTURE_COUNTDOWN_SEC = 60 * 60;

function formatSecs(secs: number): string {
	const h = Math.floor(secs / 3600) % 24;
	const m = Math.floor(secs / 60) % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function secondsUntilDeparture(
	legDepartSec: number,
	nowSec = (Date.now() / 1000 + JST_OFFSET_SEC) % 86400,
): number | null {
	const diff = legDepartSec - nowSec;
	if (diff < -DEPARTURE_GRACE_SEC || diff > DEPARTURE_COUNTDOWN_SEC) {
		return null;
	}
	return diff;
}

function legMinutes(leg: PlanLegUi): number {
	return Math.max(1, Math.round((leg.arriveSec - leg.departSec) / 60));
}

function legWalkMeters(leg: PlanLegUi): number {
	return (
		Math.round((leg.arriveSec - leg.departSec) / 60) * WALK_SPEED_M_PER_MIN
	);
}

function lineColor(leg: PlanLegUi): string | undefined {
	if (!leg.color) return undefined;
	return leg.color.startsWith("#") ? leg.color : `#${leg.color}`;
}

function turnDirectionKey(direction: WalkTurn["direction"]): keyof Dict {
	switch (direction) {
		case "sharp-left":
			return "turn.sharp_left";
		case "sharp-right":
			return "turn.sharp_right";
		default:
			return `turn.${direction}`;
	}
}

function renderDepartTime(leg: PlanLegUi, t: T): ReactElement | string {
	if (leg.mode === "walk") return formatSecs(leg.departSec);
	const untilDeparture = secondsUntilDeparture(leg.departSec);
	const departAt = t("leg.depart_at", { time: formatSecs(leg.departSec) });
	if (untilDeparture === null || untilDeparture < 0) return departAt;
	const minutes = Math.ceil(untilDeparture / 60);
	return (
		<>
			{departAt}
			{" · "}
			<span className="route-card__leg-countdown">
				{t("leg.depart_in_min", { minutes })}
			</span>
		</>
	);
}

export function RouteCard(props: {
	option: PlanOptionUi;
	rank: number;
	t: T;
	active?: boolean;
	onSelect?: () => void;
	defaultExpanded?: boolean;
	focusedLegIdx?: number | undefined;
	onLegFocus?: ((legIdx: number | null) => void) | undefined;
}): ReactElement {
	const {
		option,
		rank,
		t,
		active,
		onSelect,
		defaultExpanded,
		focusedLegIdx,
		onLegFocus,
	} = props;
	const [expanded, setExpanded] = useState(defaultExpanded ?? false);
	const minutes = Math.round(option.durationSec / 60);
	const liveDelaySec = option.live?.delaySec ?? 0;
	const liveDisruptions = option.live?.disruptions ?? [];
	const liveBanner =
		option.live && liveDelaySec >= 60 ? (
			<div className="route-card__live-banner" role="status">
				⚠️{" "}
				{t("live.delay_min", {
					minutes: Math.round(liveDelaySec / 60),
				})}
			</div>
		) : liveDisruptions.length > 0 ? (
			<div className="route-card__live-banner" role="status">
				⚠️ {t("live.disruption")}: {liveDisruptions[0]}
			</div>
		) : null;
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
			{liveBanner}
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
							{option.fareIcYen !== undefined &&
							option.fareIcYen !== option.fareYen ? (
								<span className="route-card__fare-ic">
									{" "}
									· {t("route.fare_ic", { yen: option.fareIcYen })}
								</span>
							) : null}
						</dd>
					</div>
				</dl>
				<button
					type="button"
					className="route-card__toggle"
					aria-expanded={expanded}
					onClick={(e) => {
						e.stopPropagation();
						setExpanded((v) => !v);
					}}
				>
					{expanded ? t("route.hide_detail") : t("route.show_detail")}
				</button>
			</header>
			<ol className="route-card__legs">
				{option.legs.map((leg, idx) => {
					const color = lineColor(leg);
					const isFocused = focusedLegIdx === idx;
					const turns =
						expanded && leg.mode === "walk"
							? turnsFromPolyline(option.map?.segments[idx]?.polyline ?? [])
							: [];
					return (
						<li
							className={`route-card__leg${
								isFocused ? " route-card__leg--focused" : ""
							}${onLegFocus ? " route-card__leg--clickable" : ""}`}
							data-mode={leg.mode}
							style={color ? { borderLeftColor: color } : undefined}
							onClick={
								onLegFocus
									? (e) => {
											e.stopPropagation();
											onLegFocus(isFocused ? null : idx);
										}
									: undefined
							}
							onKeyDown={
								onLegFocus
									? (e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												e.stopPropagation();
												onLegFocus(isFocused ? null : idx);
											}
										}
									: undefined
							}
							tabIndex={onLegFocus ? 0 : -1}
							// biome-ignore lint/suspicious/noArrayIndexKey: leg list is fully derived
							key={idx}
						>
							<div className="route-card__leg-line">
								{leg.mode === "walk" ? t("leg.walk") : (leg.line ?? leg.mode)}
								{leg.headsign ? (
									<span className="route-card__leg-headsign">
										{" "}
										· {t("leg.headsign", { name: leg.headsign })}
									</span>
								) : null}
							</div>
							<div className="route-card__leg-od">
								<span>{leg.fromName}</span>
								<span aria-hidden="true">→</span>
								<span>{leg.toName}</span>
							</div>
							<div className="route-card__leg-time">
								{renderDepartTime(leg, t)} → {formatSecs(leg.arriveSec)} ·{" "}
								{t("leg.duration_min", { minutes: legMinutes(leg) })}
								{leg.platform !== undefined ? (
									<span className="route-card__leg-platform">
										{" "}
										· {t("leg.platform")} {leg.platform}
									</span>
								) : null}
								{leg.mode === "walk" ? (
									<span className="route-card__leg-walk">
										{" "}
										· {t("leg.walk_meters", { meters: legWalkMeters(leg) })}
									</span>
								) : null}
							</div>
							{expanded && color ? (
								<div
									className="route-card__leg-color"
									style={{ background: color }}
								/>
							) : null}
							{turns.length > 0 ? (
								<ul className="route-card__leg-turns">
									{turns.map((turn) => {
										const direction = t(turnDirectionKey(turn.direction));
										return (
											<li
												key={`${turn.distanceMeters}-${turn.direction}`}
												className="route-card__leg-turn"
											>
												{t("turn.at_meters", {
													meters: turn.distanceMeters,
													direction,
												})}
											</li>
										);
									})}
								</ul>
							) : null}
						</li>
					);
				})}
			</ol>
			{expanded ? (
				<dl className="route-card__detail">
					<div>
						<dt>{t("route.leg_count", { count: option.legs.length })}</dt>
						<dd>
							{formatSecs(option.legs[0]?.departSec ?? 0)} →{" "}
							{formatSecs(option.legs[option.legs.length - 1]?.arriveSec ?? 0)}
						</dd>
					</div>
				</dl>
			) : null}
		</article>
	);
}
