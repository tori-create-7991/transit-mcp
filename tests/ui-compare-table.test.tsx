import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { RouteCompareTable } from "../src/ui/components/RouteCompareTable.js";
import { makeT } from "../src/ui/i18n/index.js";
import type { PlanOptionUi } from "../src/ui/types.js";

type RowElement = ReactElement<{
	className: string;
	onClick: () => void;
}>;

function option(idx: number): PlanOptionUi {
	return {
		durationSec: (idx + 1) * 600,
		transfers: idx,
		fareYen: 200 + idx * 10,
		fareIcYen: 190 + idx * 10,
		legs: [
			{
				mode: "walk",
				fromName: "A",
				toName: "B",
				departSec: 0,
				arriveSec: 300,
			},
			{
				mode: "rail",
				line: idx % 2 === 0 ? "Yamanote Line" : "Chuo Line",
				fromName: "B",
				toName: "C",
				departSec: 300,
				arriveSec: 900,
			},
		],
	};
}

function rowsFromTable(table: ReactElement): RowElement[] {
	const tableProps = table.props as {
		children: [ReactElement, ReactElement<{ children: RowElement[] }>];
	};
	const tbody = tableProps.children[1];
	return tbody.props.children;
}

describe("RouteCompareTable", () => {
	it("renders one row for each route option", () => {
		const table = RouteCompareTable({
			options: [option(0), option(1), option(2), option(3)],
			activeIdx: 0,
			onSelect: vi.fn(),
			t: makeT("en"),
		});

		expect(rowsFromTable(table)).toHaveLength(4);
	});

	it("calls onSelect with the zero-based row index when a row is clicked", () => {
		const onSelect = vi.fn();
		const table = RouteCompareTable({
			options: [option(0), option(1), option(2), option(3)],
			activeIdx: 0,
			onSelect,
			t: makeT("en"),
		});

		rowsFromTable(table)[1]!.props.onClick();

		expect(onSelect).toHaveBeenCalledWith(1);
	});

	it("marks the active row", () => {
		const table = RouteCompareTable({
			options: [option(0), option(1), option(2), option(3)],
			activeIdx: 1,
			onSelect: vi.fn(),
			t: makeT("en"),
		});

		expect(rowsFromTable(table)[1]!.props.className).toContain(
			"route-compare__row--active",
		);
	});
});
