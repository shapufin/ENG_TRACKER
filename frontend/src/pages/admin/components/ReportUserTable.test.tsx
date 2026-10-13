import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportUserTable } from "./ReportUserTable";

const user = {
  user_id: 1,
  full_name: "Ada Lovelace",
  username: "ada",
  team: "Core",
  overtime: { total_hours: 8, approved_hours: 6 },
  standby: { total_hours: 4, approved_hours: 2 },
  leave: { total_days: 5, approved_days: 3 },
};

describe("ReportUserTable", () => {
  it("shows overtime and standby columns on the overtime tab", () => {
    render(<ReportUserTable activeTab="overtime_standby" data={[user]} />);

    expect(
      screen.getByRole("columnheader", { name: "Overtime (Total/Appr.)" })
    ).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Standby (Total/Appr.)" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Vacation/ })).not.toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("shows the vacation column on the vacation tab", () => {
    render(<ReportUserTable activeTab="vacation" data={[user]} />);

    expect(
      screen.getByRole("columnheader", { name: "Vacation Days (Total/Appr.)" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Overtime/ })).not.toBeInTheDocument();
  });

  it("spans the empty state across the tab's real column count", () => {
    const { unmount } = render(<ReportUserTable activeTab="overtime_standby" data={[]} />);
    expect(screen.getByRole("cell").getAttribute("colspan")).toBe("4");
    unmount();

    render(<ReportUserTable activeTab="vacation" data={[]} />);
    expect(screen.getByRole("cell").getAttribute("colspan")).toBe("3");
  });
});
