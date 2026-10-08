import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { RoleDistributionBody } from "./RoleDistributionBody";
import { TechDistributionBody } from "./TechDistributionBody";
import { ApproverSlaBody } from "./ApproverSlaBody";
import { RejectionAnalysisWidget } from "./RejectionAnalysisWidget";
import { makePeople } from "./adminFixtures";

const widgets = [
  ["RoleDistributionBody", RoleDistributionBody],
  ["TechDistributionBody", TechDistributionBody],
  ["ApproverSlaBody", ApproverSlaBody],
  ["RejectionAnalysisWidget", RejectionAnalysisWidget],
] as const;

describe.each(widgets)("%s shared states", (_name, Widget) => {
  it("shows a loading placeholder", () => {
    render(<Widget isLoading />);
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
  });

  it("shows an error with a retry", () => {
    const onRetry = vi.fn();
    render(<Widget isError onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("RoleDistributionBody", () => {
  it("lists the role counts and warns on employees without a TL", () => {
    render(<RoleDistributionBody data={makePeople()} />);
    const row = (name: string) => screen.getByText(name).closest("li")!;
    expect(row("Italian TLs")).toHaveTextContent("3");
    expect(row("HR")).toHaveTextContent("1");
    expect(row("Employees without a TL")).toHaveTextContent("4");
    expect(row("Employees without a TL").className).toMatch(/tone-warning/);
  });

  it("does not warn when everyone has a TL", () => {
    const base = makePeople();
    render(
      <RoleDistributionBody
        data={makePeople({ roles: { ...base.roles, employees_without_tl: 0 } })}
      />
    );
    expect(screen.getByText("Employees without a TL").closest("li")!.className).not.toMatch(
      /tone-warning/
    );
  });
});

describe("TechDistributionBody", () => {
  it("shows each tech with its own levels, Ungraded last", () => {
    render(
      <TechDistributionBody
        data={makePeople({
          techs: [
            ...makePeople().techs,
            {
              tech_id: 2,
              name: "Cloud",
              count: 1,
              levels: [{ code: "B1", name: "Senior", rank: 1, count: 1 }],
            },
          ],
        })}
      />
    );
    const noc = screen.getByRole("group", { name: "NOC" });
    const chips = within(noc)
      .getAllByRole("listitem")
      .map((c) => c.textContent);
    expect(chips).toEqual(["Junior 3", "Ungraded 2"]);
    const cloud = screen.getByRole("group", { name: "Cloud" });
    expect(within(cloud).queryByText(/Junior/)).not.toBeInTheDocument();
  });

  it("shows an empty state with no tech assignments", () => {
    render(<TechDistributionBody data={makePeople({ techs: [] })} />);
    expect(screen.getByText("No tech assignments yet")).toBeInTheDocument();
  });
});

describe("ApproverSlaBody", () => {
  it("shows decisions, rate and average hours", () => {
    render(<ApproverSlaBody data={makePeople()} />);
    const row = screen.getByRole("row", { name: /Ana Lee/ });
    expect(row).toHaveTextContent("21");
    expect(row).toHaveTextContent("90.5%");
    expect(row).toHaveTextContent("14.2h");
  });

  it("shows an empty state with no recent decisions", () => {
    render(<ApproverSlaBody data={makePeople({ approver_sla: [] })} />);
    expect(screen.getByText("No decisions in the last 30 days")).toBeInTheDocument();
  });
});

describe("RejectionAnalysisWidget", () => {
  it("shows counts per type and the top reasons", () => {
    render(<RejectionAnalysisWidget data={makePeople()} />);
    expect(screen.getByText("Overtime").closest("li")).toHaveTextContent("2");
    expect(screen.getByText("Leave").closest("li")).toHaveTextContent("1");
    expect(screen.getByText("missing ticket")).toBeInTheDocument();
  });

  it("shows an empty state when nothing was rejected this month", () => {
    render(
      <RejectionAnalysisWidget
        data={makePeople({
          rejections: {
            month: "2026-10",
            by_type: { overtime: 0, standby: 0, leave: 0 },
            top_reasons: [],
          },
        })}
      />
    );
    expect(screen.getByText("No rejections this month")).toBeInTheDocument();
  });
});
