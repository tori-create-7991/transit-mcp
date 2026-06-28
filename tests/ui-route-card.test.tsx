import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { makeT } from "../src/ui/i18n/index.js";
import {
	RouteCard,
	secondsUntilDeparture,
} from "../src/ui/components/RouteCard.js";
import type { PlanOptionUi } from "../src/ui/types.js";

function optionWithLeg(mode: string, departSec: number): PlanOptionUi {
	const leg = {
		mode,
		fromName: "Shibuya",
		toName: "Tokyo",
		departSec,
		arriveSec: departSec + 600,
		...(mode === "walk" ? {} : { line: "Yamanote Line" }),
	};
	return {
		durationSec: 600,
		transfers: 0,
		legs: [leg],
	};
}

describe("secondsUntilDeparture", () => {
	it("returns remaining seconds when departure is within one hour", () => {
		expect(secondsUntilDeparture(13 * 3600 + 45 * 60, 13 * 3600 + 42 * 60)).toBe(
			180,
		);
	});

	it("returns null for past departures older than the fetch grace window", () => {
		expect(secondsUntilDeparture(13 * 3600, 13 * 3600 + 6 * 60)).toBeNull();
	});
});

describe("RouteCard", () => {
	it("renders transit departure time with an inline countdown", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-06-28T04:42:00.000Z"));

		const html = renderToStaticMarkup(
			<RouteCard
				option={optionWithLeg("rail", 13 * 3600 + 45 * 60)}
				rank={1}
				t={makeT("ja")}
			/>,
		);

		expect(html).toContain("13:45 発");
		expect(html).toContain("route-card__leg-countdown");
		expect(html).toContain("あと 3 分");

		vi.useRealTimers();
	});

	it("keeps walk leg time range unchanged", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-06-28T04:42:00.000Z"));

		const html = renderToStaticMarkup(
			<RouteCard
				option={optionWithLeg("walk", 13 * 3600 + 45 * 60)}
				rank={1}
				t={makeT("ja")}
			/>,
		);

		expect(html).toContain("13:45 → 13:55");
		expect(html).not.toContain("route-card__leg-countdown");

		vi.useRealTimers();
	});
});
