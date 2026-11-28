import { beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TeamGroupedTables, type MonthlyTableSection } from "./TeamGroupedTables";
import type { AppColumnDef } from "@/components/ui/tableTypes";

const renders: Record<string, number> = {};
const columnsMenuFlags: Record<string, boolean | undefined> = {};

vi.mock("@/components/ui/DataTable", () => ({
  DataTable: ({ data, showColumnsMenu }: { data: { id: number }[]; showColumnsMenu?: boolean }) => {
    const key = data.map((r) => r.id).join(",");
    renders[key] = (renders[key] ?? 0) + 1;
    columnsMenuFlags[key] = showColumnsMenu;
    return (
      <table>
        <tbody>
          {data.map((r) => (
            <tr key={r.id}>
              <td>row-{r.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
}));

type Row = { id: number; user: number };
const rows: Row[] = [
  { id: 1, user: 1 },
  { id: 2, user: 1 },
  { id: 3, user: 1 },
  { id: 4, user: 1 },
];
const buildSections = (data: Row[]): MonthlyTableSection<Row>[] => [
  { key: "2026-11", title: "November", rows: data.filter((r) => r.id === 1) },
  { key: "2026-10", title: "October", rows: data.filter((r) => r.id === 2 || r.id === 3) },
  { key: "2026-09", title: "September", rows: data.filter((r) => r.id === 4) },
];
const columns: AppColumnDef<Row>[] = [];
const columnsBuilder = () => columns;
const userMetaMap = new Map();

const renderTables = (onSectionCollapse?: (ids: string[]) => void) =>
  render(
    <TeamGroupedTables
      rows={rows}
      columnsBuilder={columnsBuilder}
      emptyCopy="none"
      memberGroupMode="range"
      userMetaMap={userMetaMap}
      buildSections={buildSections}
      onSectionCollapse={onSectionCollapse}
    />
  );

describe("TeamGroupedTables month sections", () => {
  beforeEach(() => {
    for (const k of Object.keys(renders)) delete renders[k];
    for (const k of Object.keys(columnsMenuFlags)) delete columnsMenuFlags[k];
  });

  it("only the newest month is expanded on first render", () => {
    renderTables();
    expect(screen.getByText("row-1")).toBeInTheDocument();
    expect(screen.queryByText("row-2")).not.toBeInTheDocument();
    expect(screen.queryByText("row-4")).not.toBeInTheDocument();
  });

  it("collapsing a section reports its row ids", () => {
    const onCollapse = vi.fn();
    renderTables(onCollapse);
    fireEvent.click(screen.getByRole("button", { name: /October/ }));
    expect(onCollapse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /November/ }));
    expect(onCollapse).toHaveBeenCalledTimes(1);
    expect(onCollapse).toHaveBeenCalledWith(["1"]);
  });

  it("toggling one section does not re-render the others", () => {
    renderTables();
    expect(renders["1"]).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: /October/ }));
    expect(screen.getByText("row-2")).toBeInTheDocument();
    expect(renders["2,3"]).toBe(1);
    expect(renders["1"]).toBe(1);
  });

  it("enables the Columns menu on only the first expanded month section", () => {
    renderTables();
    fireEvent.click(screen.getByRole("button", { name: /October/ }));
    fireEvent.click(screen.getByRole("button", { name: /September/ }));
    const enabledCount = Object.values(columnsMenuFlags).filter(Boolean).length;
    expect(enabledCount).toBe(1);
    expect(columnsMenuFlags["1"]).toBe(true);
    expect(columnsMenuFlags["2,3"]).toBe(false);
    expect(columnsMenuFlags["4"]).toBe(false);
  });
});
