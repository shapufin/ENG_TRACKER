import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalendarPageModals } from "./CalendarPageModals";

vi.mock("@/components/calendar/UserStatusModal", () => ({
  UserStatusModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="user-status-modal">UserStatus</div> : null,
}));
vi.mock("@/components/calendar/EventActionModal", () => ({
  EventActionModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="event-action-modal">EventAction</div> : null,
}));
vi.mock("@/components/calendar/ConflictsModal", () => ({
  ConflictsModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="conflicts-modal">Conflicts</div> : null,
}));
vi.mock("./CalendarFormDialog", () => ({
  CalendarFormDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="calendar-form-dialog">CalendarForm</div> : null,
}));

const baseData: any = {
  dialogOpen: false,
  handleDialogOpenChange: vi.fn(),
  requestType: "vacation",
  setRequestType: vi.fn(),
  reason: "",
  setReason: vi.fn(),
  carryOverAndBalance: null,
  createRequest: { isPending: false, isError: false, error: null },
  handleSubmit: vi.fn(),
  selectedDates: null,
  activeModalUser: null,
  userModalOpen: false,
  setUserModalOpen: vi.fn(),
  selectedUserBalances: [],
  holidayData: [],
  actionModalEvent: null,
  setActionModalEvent: vi.fn(),
  conflictsModalOpen: false,
  setConflictsModalOpen: vi.fn(),
  allConflictEntries: [],
};

describe("CalendarPageModals", () => {
  it("renders nothing when all modals are closed", () => {
    render(<CalendarPageModals user={null} canViewTeamData={false} data={baseData} />);
    expect(screen.queryByTestId("calendar-form-dialog")).not.toBeInTheDocument();
  });

  it("renders CalendarFormDialog when dialogOpen", () => {
    render(
      <CalendarPageModals
        user={null}
        canViewTeamData={false}
        data={{ ...baseData, dialogOpen: true }}
      />
    );
    expect(screen.getByTestId("calendar-form-dialog")).toBeInTheDocument();
  });

  it("renders UserStatusModal when user modal open", () => {
    render(
      <CalendarPageModals
        user={null}
        canViewTeamData={false}
        data={{ ...baseData, activeModalUser: { id: "1" }, userModalOpen: true }}
      />
    );
    expect(screen.getByTestId("user-status-modal")).toBeInTheDocument();
  });

  it("renders EventActionModal when action event exists", () => {
    render(
      <CalendarPageModals
        user={null}
        canViewTeamData={false}
        data={{ ...baseData, actionModalEvent: { id: "1" } }}
      />
    );
    expect(screen.getByTestId("event-action-modal")).toBeInTheDocument();
  });

  it("renders ConflictsModal when conflicts modal open", () => {
    render(
      <CalendarPageModals
        user={null}
        canViewTeamData={false}
        data={{ ...baseData, conflictsModalOpen: true }}
      />
    );
    expect(screen.getByTestId("conflicts-modal")).toBeInTheDocument();
  });

  it("renders dialog title with selected dates", () => {
    const { container } = render(
      <CalendarPageModals
        user={null}
        canViewTeamData={false}
        data={{
          ...baseData,
          dialogOpen: true,
          selectedDates: { start: "2024-06-01", end: "2024-06-05" },
        }}
      />
    );
    expect(container).toBeInTheDocument();
  });
});
