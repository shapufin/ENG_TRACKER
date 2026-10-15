import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { reportUserColumns } from "./ReportsSection";

type Row = { avg_resolution_hours: number | null; sla_compliance_pct: number | null };

const cellText = (id: "avg_resolution_hours" | "sla_compliance_pct", row: Row) => {
  const column = reportUserColumns.find((c) => "accessorKey" in c && c.accessorKey === id);
  const cell = column?.cell as (ctx: { row: { original: Row } }) => React.ReactNode;
  return render(<>{cell({ row: { original: row } })}</>).container.textContent;
};

// The API sends null (not undefined) when a metric was not computed; the table
// used to print "nullh" / "null%".
describe("ticket KPI per-user report cells", () => {
  it("shows N/A for metrics that were not computed", () => {
    const row = { avg_resolution_hours: null, sla_compliance_pct: null };
    expect(cellText("avg_resolution_hours", row)).toBe("N/A");
    expect(cellText("sla_compliance_pct", row)).toBe("N/A");
  });

  it("formats computed metrics", () => {
    const row = { avg_resolution_hours: 4.5, sla_compliance_pct: 0 };
    expect(cellText("avg_resolution_hours", row)).toBe("4.5h");
    expect(cellText("sla_compliance_pct", row)).toBe("0%");
  });
});
