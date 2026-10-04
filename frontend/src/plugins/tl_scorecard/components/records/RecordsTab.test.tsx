import React from "react";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import { RecordsTab } from "./RecordsTab";
import { tlScorecardService } from "../../services/tlScorecardService";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Radix Select is unreliable to drive via fireEvent in JSDOM: render it flat.
vi.mock("@/components/ui/select", () => {
  const Ctx = React.createContext<{ onValueChange?: (v: string) => void }>({});
  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange?: (v: string) => void;
    }) => <Ctx.Provider value={{ onValueChange }}>{children}</Ctx.Provider>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const ctx = React.useContext(Ctx);
      return (
        <button type="button" role="option" onClick={() => ctx.onValueChange?.(value)}>
          {children}
        </button>
      );
    },
    SelectTrigger: ({ id, children }: { id?: string; children: React.ReactNode }) => (
      <button type="button" role="combobox" id={id}>
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  };
});

const perms = vi.hoisted(() => ({
  value: { isHBPR: false, isTeamLeader: true, isAdmin: false, isSuperuser: false } as Record<
    string,
    boolean
  >,
}));
vi.mock("@/context/PermissionContext", () => ({ usePermissions: () => perms.value }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, username: "me", teams: [] } }),
}));
vi.mock("@/services/userService", () => ({
  userService: {
    getMyTeamMembers: vi.fn().mockResolvedValue([]),
    getItalianTeamLeaders: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../services/tlScorecardService", () => ({
  tlScorecardService: {
    listMeetings: vi.fn(),
    listIdleFlags: vi.fn(),
    listAbsences: vi.fn(),
    listReviewDeliveries: vi.fn(),
    listPromotionFlags: vi.fn(),
    listPIPRecords: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    shareMeeting: vi.fn(),
    resolveIdleFlag: vi.fn(),
    addressAbsence: vi.fn(),
    approvePIPRecord: vi.fn(),
    rejectPIPRecord: vi.fn(),
    completePIPRecord: vi.fn(),
    cancelPIPRecord: vi.fn(),
    decidePromotionFlag: vi.fn(),
    createIdleStatusUpdate: vi.fn(),
  },
}));

const svc = tlScorecardService as unknown as Record<string, ReturnType<typeof vi.fn>>;

const MEETING = {
  id: 1,
  meeting_type: "one_on_one",
  organizer: 1,
  organizer_name: "Me",
  counterparty: 20,
  counterparty_name: "Jane",
  team: null,
  occurred_on: "2026-09-02",
  notes: "",
  shared_summary: "",
  shared_at: null,
};
const IDLE = {
  id: 2,
  employee: 20,
  employee_name: "Jane",
  flagged_by: 1,
  flagged_by_name: "Me",
  flagged_on: "2026-09-03",
  status: "open",
  productivity_task: "Docs",
  resolved_on: null,
  notes: "",
};
const ABSENCE = {
  id: 3,
  employee: 20,
  employee_name: "Jane",
  flagged_by: 1,
  flagged_by_name: "Me",
  absence_date: "2020-01-01",
  reason: "Sick",
  addressed_on: null,
  notes: "",
};
const REVIEW = {
  id: 4,
  leader: 1,
  leader_name: "Me",
  period: "2026-08",
  recipient: "GM",
  delivered_on: "2026-09-04",
  notes: "",
};
const PROMOTION = {
  id: 5,
  employee: 20,
  employee_name: "Jane",
  nominated_by: 1,
  nominated_by_name: "Me",
  nominated_on: "2026-09-05",
  status: "nominated",
  decided_on: null,
  decided_by: null,
  decision_note: "",
  notes: "",
};
const PIP = {
  id: 6,
  employee: 20,
  employee_name: "Jane",
  tl: 1,
  tl_name: "Me",
  status: "draft",
  start_date: "2026-09-06",
  approved_by: null,
  approved_by_name: null,
  approved_at: null,
  notes: "",
  closed_on: null,
  status_note: "",
};

const Where: React.FC = () => <div data-testid="where">{useLocation().search}</div>;

const renderTab = (
  search = "?tab=records",
  props: Partial<React.ComponentProps<typeof RecordsTab>> = {}
) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[`/tl-scorecard${search}`]}>
        <RecordsTab {...props} />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>
  );

const openAction = (title: string, label: string) => {
  fireEvent.click(screen.getByRole("button", { name: `Actions for ${title}` }));
  fireEvent.click(screen.getByRole("button", { name: label }));
};

beforeEach(() => {
  vi.clearAllMocks();
  perms.value = { isHBPR: false, isTeamLeader: true, isAdmin: false, isSuperuser: false };
  svc.listMeetings.mockResolvedValue([MEETING]);
  svc.listIdleFlags.mockResolvedValue([IDLE]);
  svc.listAbsences.mockResolvedValue([ABSENCE]);
  svc.listReviewDeliveries.mockResolvedValue([REVIEW]);
  svc.listPromotionFlags.mockResolvedValue([PROMOTION]);
  svc.listPIPRecords.mockResolvedValue([PIP]);
  for (const name of [
    "updateRecord",
    "deleteRecord",
    "shareMeeting",
    "resolveIdleFlag",
    "addressAbsence",
    "approvePIPRecord",
    "rejectPIPRecord",
    "completePIPRecord",
    "cancelPIPRecord",
    "decidePromotionFlag",
    "createIdleStatusUpdate",
  ]) {
    svc[name].mockResolvedValue({ data: {} });
  }
});

describe("RecordsTab URL state", () => {
  it("defaults to meetings and falls back to it for an invalid kind", async () => {
    renderTab("?tab=records&kind=nonsense");
    expect(await screen.findByText("1-on-1")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /meetings/i })).toHaveAttribute("aria-selected", "true");
  });

  it("opens the kind named in the URL", async () => {
    renderTab("?tab=records&kind=pips");
    expect(await screen.findByText("Pending approval")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /pips/i })).toHaveAttribute("aria-selected", "true");
  });

  it("writes the kind to the URL when another kind is chosen", async () => {
    renderTab();
    await screen.findByText("1-on-1");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /idle flags/i }), { button: 0 });
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("kind=idle"));
    expect(await screen.findByText("Docs")).toBeInTheDocument();
  });

  it("shows counts beside each kind", async () => {
    renderTab();
    expect(await screen.findByRole("tab", { name: /^meetingss*1$/i })).toBeInTheDocument();
  });

  it("narrows by month", async () => {
    renderTab("?tab=records&month=2025-01-01");
    expect(await screen.findByText("No match")).toBeInTheDocument();
  });
});

describe("RecordsTab mockup layout", () => {
  it("filters by state pills and writes ?state= to the URL", async () => {
    renderTab("?tab=records&kind=idle");
    await screen.findByText("Docs");
    fireEvent.click(screen.getByRole("button", { name: /needs attention/i }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("state=attention"));
    expect(screen.getByText("Docs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^completed$/i }));
    expect(await screen.findByText("No match")).toBeInTheDocument();
  });

  it("pages long lists eight at a time", async () => {
    const meetings = Array.from({ length: 9 }, (_, i) => ({
      ...MEETING,
      id: 100 + i,
      occurred_on: `2026-09-${String(i + 1).padStart(2, "0")}`,
    }));
    svc.listMeetings.mockResolvedValue(meetings);
    renderTab("?tab=records&kind=meetings");
    expect(await screen.findByText("Showing 8 of 9 records")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Showing 1 of 9 records")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("page=2"));
  });

  it("shows the latest focus with a full-history link that clears the month", async () => {
    svc.listMeetings.mockResolvedValue([{ ...MEETING, notes: "Discussed roadmap" }]);
    renderTab("?tab=records&kind=meetings&month=2026-09-01");
    expect(await screen.findByText(/Latest meeting \(Jane\):/)).toBeInTheDocument();
    expect(screen.getByText("Discussed roadmap")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /view full meeting history/i });
    expect(link).toHaveAttribute("href", "/tl-scorecard?tab=records&kind=meetings");
  });

  it("renders the toolbar, sidebar summary and avatars", async () => {
    renderTab("?tab=records&kind=idle");
    expect(await screen.findByText("Docs")).toBeInTheDocument();
    expect(await screen.findByText("Timeframe")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search records or members…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export report" })).toBeInTheDocument();
    expect(screen.getByText("Record Categories")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Resolved records" })).toBeInTheDocument();
    expect(screen.getAllByTitle("Jane").length).toBeGreaterThan(0);
  });
});

describe("RecordsTab detail dialog", () => {
  it("opens the detail dialog from the eye button without firing the row action", async () => {
    renderTab("?tab=records&kind=idle");
    await screen.findByText("Docs");
    const eyeButtons = screen.getAllByRole("button", { name: /view details of/i });
    expect(eyeButtons).toHaveLength(1);
    fireEvent.click(eyeButtons[0]);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("does not open the detail dialog when a row action is activated by keyboard", async () => {
    renderTab("?tab=records&kind=idle");
    await screen.findByText("Docs");
    fireEvent.keyDown(screen.getByRole("button", { name: /actions for/i }), {
      key: "Enter",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("RecordsTab create entry point", () => {
  it("offers the kind's create action in the toolbar", async () => {
    const onCreateRecord = vi.fn();
    renderTab("?tab=records&kind=idle", { onCreateRecord });
    await screen.findByText("Docs");
    fireEvent.click(screen.getByRole("button", { name: "Flag idle" }));
    expect(onCreateRecord).toHaveBeenCalledWith("idle");
  });

  it("renders no create button without a create handler", async () => {
    renderTab("?tab=records&kind=idle");
    await screen.findByText("Docs");
    expect(screen.queryByRole("button", { name: "Flag idle" })).not.toBeInTheDocument();
  });
});

describe("RecordsTab panels", () => {
  it.each([
    ["meetings", "1-on-1", "Not shared"],
    ["idle", "Docs", "Open"],
    ["absences", "Sick", "Over 5 working days open"],
    ["reviews", "GM", "Delivered"],
    ["promotions", "2026-09-05", "Awaiting decision"],
    ["pips", "2026-09-06", "Pending approval"],
  ])("lists %s with a visible state", async (kind, cell, state) => {
    renderTab(`?tab=records&kind=${kind}`);
    expect(await screen.findAllByText(cell)).not.toHaveLength(0);
    expect(screen.getByText(state)).toBeInTheDocument();
  });

  it.each([
    ["meetings", "listMeetings"],
    ["idle", "listIdleFlags"],
    ["absences", "listAbsences"],
    ["reviews", "listReviewDeliveries"],
    ["promotions", "listPromotionFlags"],
    ["pips", "listPIPRecords"],
  ])("handles empty, error+retry and 403 for %s", async (kind, method) => {
    svc[method].mockResolvedValueOnce([]);
    const { unmount } = renderTab(`?tab=records&kind=${kind}`);
    expect(await screen.findByText("No records yet")).toBeInTheDocument();
    unmount();

    svc[method].mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([]);
    renderTab(`?tab=records&kind=${kind}`);
    fireEvent.click(await screen.findByRole("button", { name: /retry/i }));
    expect(await screen.findByText("No records yet")).toBeInTheDocument();
  });

  it("shows an honest stat strip above the list", async () => {
    renderTab("?tab=records&kind=idle");
    await screen.findByText("Docs");
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getAllByText("Completed")).toHaveLength(2);
    expect(screen.getByTestId("stat-card-progress-fill")).toHaveStyle({ width: "0%" });
  });

  it("filters the visible rows by search text", async () => {
    renderTab();
    await screen.findByText("1-on-1");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search records or members" }), {
      target: { value: "zzz" },
    });
    expect(await screen.findByText("No match")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search records or members" }), {
      target: { value: "jane" },
    });
    expect(await screen.findByText("Jane")).toBeInTheDocument();
  });

  it("shows a no-access message, not an empty list, on 403", async () => {
    svc.listMeetings.mockRejectedValue({ response: { status: 403 } });
    renderTab();
    expect(await screen.findByText("You do not have access to this")).toBeInTheDocument();
    expect(screen.queryByText("No records yet")).not.toBeInTheDocument();
  });
});

describe("RecordsTab ownership", () => {
  it("hides row actions for records the viewer does not own", async () => {
    svc.listMeetings.mockResolvedValue([{ ...MEETING, organizer: 99 }]);
    renderTab();
    await screen.findByText("1-on-1");
    expect(screen.queryByRole("button", { name: /^Actions for/ })).not.toBeInTheDocument();
  });

  it("lets staff act on someone else's record", async () => {
    perms.value = { isHBPR: false, isTeamLeader: false, isAdmin: true, isSuperuser: false };
    svc.listMeetings.mockResolvedValue([{ ...MEETING, organizer: 99 }]);
    renderTab();
    expect(await screen.findByRole("button", { name: /^Actions for/ })).toBeInTheDocument();
  });

  it("does not offer approve to the owning team leader", async () => {
    renderTab("?tab=records&kind=pips");
    await screen.findByText("Pending approval");
    fireEvent.click(screen.getByRole("button", { name: "Actions for PIP for Jane" }));
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});

describe("RecordsTab state actions", () => {
  it("shares a meeting summary", async () => {
    renderTab();
    await screen.findByText("1-on-1");
    openAction("1-on-1 on 2026-09-02", "Share summary");
    fireEvent.change(await screen.findByLabelText("Summary for the team member"), {
      target: { value: "Agreed goals" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Share summary" }));
    await waitFor(() => expect(svc.shareMeeting).toHaveBeenCalledWith(1, "Agreed goals"));
    expect(toast.success).toHaveBeenCalledWith("Summary shared");
  });

  it("resolves an idle flag", async () => {
    renderTab("?tab=records&kind=idle");
    await screen.findByText("Docs");
    openAction("Idle flag for Jane", "Mark resolved");
    await waitFor(() => expect(svc.resolveIdleFlag).toHaveBeenCalledWith(2));
  });

  it("addresses an absence", async () => {
    renderTab("?tab=records&kind=absences");
    await screen.findByText("Sick");
    openAction("Absence of Jane on 2020-01-01", "Mark addressed");
    await waitFor(() => expect(svc.addressAbsence).toHaveBeenCalledWith(3));
  });

  it("lets staff approve a draft PIP they are not part of", async () => {
    perms.value = { isTeamLeader: false, isAdmin: true, isSuperuser: false };
    svc.listPIPRecords.mockResolvedValue([{ ...PIP, tl: 9, tl_name: "Other TL" }]);
    renderTab("?tab=records&kind=pips");
    await screen.findByText("Pending approval");
    openAction("PIP for Jane", "Approve");
    await waitFor(() => expect(svc.approvePIPRecord).toHaveBeenCalledWith(6));
  });

  it("requires a reason to return a PIP", async () => {
    perms.value = { isTeamLeader: false, isAdmin: true, isSuperuser: false };
    svc.listPIPRecords.mockResolvedValue([{ ...PIP, tl: 9 }]);
    renderTab("?tab=records&kind=pips");
    await screen.findByText("Pending approval");
    openAction("PIP for Jane", "Return to team leader");
    const submit = await screen.findByRole("button", { name: "Return PIP" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Needs evidence" } });
    fireEvent.click(submit);
    await waitFor(() => expect(svc.rejectPIPRecord).toHaveBeenCalledWith(6, "Needs evidence"));
  });

  it("completes and cancels an active PIP", async () => {
    svc.listPIPRecords.mockResolvedValue([{ ...PIP, status: "active" }]);
    renderTab("?tab=records&kind=pips");
    await screen.findByText("Active");
    openAction("PIP for Jane", "Complete");
    await waitFor(() => expect(svc.completePIPRecord).toHaveBeenCalledWith(6));

    openAction("PIP for Jane", "Cancel plan");
    const submit = await screen.findByRole("button", { name: "Cancel PIP" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Resigned" } });
    fireEvent.click(submit);
    await waitFor(() => expect(svc.cancelPIPRecord).toHaveBeenCalledWith(6, "Resigned"));
  });

  it.each([
    ["Promote", "promoted"],
    ["Decline", "declined"],
  ])("decides a promotion: %s", async (label, status) => {
    perms.value = { isTeamLeader: false, isAdmin: true, isSuperuser: false };
    svc.listPromotionFlags.mockResolvedValue([{ ...PROMOTION, nominated_by: 9 }]);
    renderTab("?tab=records&kind=promotions");
    await screen.findByText("Awaiting decision");
    openAction("Promotion nomination for Jane", label);
    fireEvent.change(await screen.findByLabelText(/decision note/i), {
      target: { value: "Strong year" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: label }).at(-1)!);
    await waitFor(() =>
      expect(svc.decidePromotionFlag).toHaveBeenCalledWith(5, {
        status,
        decision_note: "Strong year",
      })
    );
  });

  it("surfaces the server message when an action fails", async () => {
    svc.resolveIdleFlag.mockRejectedValue({ response: { data: { error: "Already resolved." } } });
    renderTab("?tab=records&kind=idle");
    await screen.findByText("Docs");
    openAction("Idle flag for Jane", "Mark resolved");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Already resolved."));
  });

  it("edits a record through its dialog", async () => {
    renderTab("?tab=records&kind=idle");
    await screen.findByText("Docs");
    openAction("Idle flag for Jane", "Edit");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Edit idle flag")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Productivity task assigned"), {
      target: { value: "Review PRs" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(svc.updateRecord).toHaveBeenCalledWith(
        "idle-flags",
        2,
        expect.objectContaining({ employee: 20, productivity_task: "Review PRs" })
      )
    );
  });

  it("asks for confirmation naming the record before deleting", async () => {
    renderTab("?tab=records&kind=idle");
    await screen.findByText("Docs");
    openAction("Idle flag for Jane", "Delete");
    expect(await screen.findByText("Delete Idle flag for Jane?")).toBeInTheDocument();
    expect(svc.deleteRecord).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(svc.deleteRecord).toHaveBeenCalledWith("idle-flags", 2));
  });
});

describe("RecordsTab record detail", () => {
  it("opens the detail dialog from the row's eye button", async () => {
    svc.listIdleFlags.mockResolvedValue([{ ...IDLE, notes: "Weekly check-ins agreed" }]);
    renderTab("?tab=records&kind=idle");
    // The list cell joins task and notes, so match the joined preview.
    await screen.findByText("Docs — Weekly check-ins agreed");
    fireEvent.click(screen.getByRole("button", { name: "View details of Idle flag for Jane" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Idle flag for Jane")).toBeInTheDocument();
    expect(within(dialog).getByText("Weekly check-ins agreed")).toBeInTheDocument();
    expect(within(dialog).getByText("Weekly status log")).toBeInTheDocument();
  });

  it("opens the detail dialog on row click and logs a weekly update", async () => {
    renderTab("?tab=records&kind=idle");
    await screen.findByText("Docs");
    fireEvent.click(screen.getByText("Docs").closest("tr")!);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /log weekly update/i }));
    fireEvent.change(await screen.findByLabelText("Status note"), {
      target: { value: "Still waiting on work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log update" }));
    await waitFor(() =>
      expect(svc.createIdleStatusUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ flag: 2, status_note: "Still waiting on work" })
      )
    );
    expect(toast.success).toHaveBeenCalledWith("Weekly update logged");
  });
});

describe("RecordsTab scope", () => {
  it("has no team-leader picker: an HBPR reads its own /hbpr workspace instead", async () => {
    // The picker (and the `tl=` URL param) belonged to the HBPR branch of this
    // shared tab; Phase 8 moved HBPR to /hbpr and removed it here.
    renderTab();
    await screen.findByText("1-on-1");
    expect(screen.queryByLabelText("Team leader")).not.toBeInTheDocument();
    expect(svc.listMeetings).toHaveBeenCalled();
  });

  it("lists every own record regardless of the owner id", async () => {
    svc.listMeetings.mockResolvedValue([
      { ...MEETING, id: 1, organizer: 1 },
      { ...MEETING, id: 2, organizer: 10, counterparty_name: "Someone Else" },
    ]);
    renderTab();
    expect(await screen.findByText("Jane")).toBeInTheDocument();
    expect(screen.getByText("Someone Else")).toBeInTheDocument();
  });
});
