import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { CalendarPageShell } from "./CalendarPageShell";

vi.mock("@/components/calendar/CalendarSidebar", () => ({ CalendarSidebar: () => <div /> }));
vi.mock("./CalendarHeader", () => ({ CalendarHeader: () => <div /> }));
vi.mock("./CalendarBottomCards", () => ({ CalendarBottomCards: () => <div /> }));
vi.mock("./CalendarPageMain", () => ({ CalendarPageMain: () => <div /> }));
vi.mock("./CalendarPageModals", () => ({ CalendarPageModals: () => <div /> }));
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => false }));

describe("CalendarPageShell modernization", () => {
  it("uses a flat GlassCard for the partial-workspace warning", () => {
    const { container } = render(
      <CalendarPageShell
        user={null}
        canViewTeamData={false}
        selectedWorkspaceIds={[1]}
        data={{ workspaceUsersPartial: true } as never}
        onPrevMonth={() => {}}
        onNextMonth={() => {}}
        onToday={() => {}}
        onSetViewMode={() => {}}
      />
    );

    const status = container.querySelector('[role="status"]');
    expect(status?.className).toContain("bg-warning/10");
    expect(status?.className).not.toContain("bg-amber-50");
  });
});
