import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RecordDetailDialog } from "./RecordDetailDialog";
import { RECORD_CONFIGS, type RecordKind, type Viewer } from "./recordKinds";
import type { IdleFlag, Meeting } from "../../types/tlScorecard";

const config = (key: RecordKind) => RECORD_CONFIGS.find((c) => c.key === key)!;

const OWNER: Viewer = { userId: 1, isStaff: false, canReview: false };

const MEETING: Meeting = {
  id: 1,
  meeting_type: "team_meeting",
  organizer: 1,
  organizer_name: "Me",
  counterparty: null,
  counterparty_name: null,
  team: 5,
  occurred_on: "2026-09-02",
  notes: "Talked about the new sprint goals\nLine two stays whole",
  shared_summary: "Goals for Q4 agreed",
  shared_at: "2026-09-03T10:00:00Z",
  attendees: [
    { id: 9, meeting: 1, user: 20, user_name: "Jane Hrbp", role: "hrbp", notes: "" },
    {
      id: 10,
      meeting: 1,
      user: 21,
      user_name: "Bob Member",
      role: "member",
      notes: "Bob's own note",
    },
  ],
  reference_url: "https://example.com/minutes",
  recorded_by: 1,
  recorded_by_name: "Me",
  recorded_at: "2026-09-02T12:00:00Z",
};

const IDLE: IdleFlag = {
  id: 2,
  employee: 20,
  employee_name: "Jane",
  flagged_by: 1,
  flagged_by_name: "Me",
  flagged_on: "2026-09-03",
  status: "open",
  productivity_task: "Docs",
  resolved_on: null,
  notes: "Check in weekly",
  status_updates: [
    {
      id: 1,
      flag: 2,
      week_of: "2026-09-07",
      status_note: "Still no tickets assigned",
      productivity_task_snapshot: "Docs",
      recorded_by: 1,
      recorded_by_name: "Me",
      recorded_at: "2026-09-07T09:00:00Z",
    },
  ],
};

const renderDialog = (
  kind: RecordKind,
  record: unknown,
  viewer: Viewer = OWNER,
  onLogUpdate = vi.fn()
) => {
  const onClose = vi.fn();
  render(
    <RecordDetailDialog
      open
      config={config(kind)}
      record={record as never}
      viewer={viewer}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onLogUpdate={onLogUpdate}
    />
  );
  return { onClose, onLogUpdate };
};

describe("RecordDetailDialog — meetings", () => {
  it("shows the full record: type, title, untruncated private notes, shared summary and attendees", () => {
    renderDialog("meetings", MEETING);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Team meeting on 2026-09-02")).toBeInTheDocument();
    expect(within(dialog).getByText("Summary shared")).toBeInTheDocument();
    // Full multi-line notes, not the truncated table preview.
    expect(within(dialog).getByText(/Talked about the new sprint goals/)).toBeInTheDocument();
    // Privacy labels: private notes vs shared summary.
    expect(within(dialog).getByText(/private — visible to you/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/shared with the team/i)).toBeInTheDocument();
    // Attendees with roles; only visible (non-redacted) notes render.
    expect(within(dialog).getByText("Jane Hrbp")).toBeInTheDocument();
    expect(within(dialog).getByText("Bob Member")).toBeInTheDocument();
    expect(within(dialog).getByText("HRBP")).toBeInTheDocument();
    expect(within(dialog).getByText("Bob's own note")).toBeInTheDocument();
    // Reference URL becomes a link.
    expect(within(dialog).getByRole("link", { name: /example\.com\/minutes/ })).toHaveAttribute(
      "href",
      "https://example.com/minutes"
    );
    // The meetings kind has no "log weekly update" affordance.
    expect(
      within(dialog).queryByRole("button", { name: /log weekly update/i })
    ).not.toBeInTheDocument();
  });

  it("marks section captions up as level-3 headings", () => {
    renderDialog("meetings", MEETING);
    const dialog = screen.getByRole("dialog");
    for (const caption of ["With", "Notes", "Shared summary", "Attendees"]) {
      expect(within(dialog).getByRole("heading", { level: 3, name: caption })).toBeInTheDocument();
    }
    // Captions are headings, not orphaned <label> elements.
    expect(within(dialog).queryByText("Shared summary")?.closest("label")).toBeNull();
  });

  it("renders explicit empty text instead of blank space", () => {
    renderDialog("meetings", { ...MEETING, notes: "", shared_summary: "", attendees: [] });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("No notes recorded.")).toBeInTheDocument();
    expect(within(dialog).getByText("No summary shared yet.")).toBeInTheDocument();
    expect(within(dialog).getByText("No attendees recorded.")).toBeInTheDocument();
  });
});

describe("RecordDetailDialog — idle flags", () => {
  it("shows the weekly status log and offers the log action on an own open flag", () => {
    const { onLogUpdate } = renderDialog("idle", IDLE);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Week of 2026-09-07")).toBeInTheDocument();
    expect(within(dialog).getByText("Still no tickets assigned")).toBeInTheDocument();
    expect(within(dialog).getByText(/Task: Docs/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /log weekly update/i }));
    expect(onLogUpdate).toHaveBeenCalledWith(IDLE);
  });

  it("hides the log action when the flag is resolved or not the viewer's", () => {
    renderDialog("idle", { ...IDLE, status: "resolved" });
    expect(screen.queryByRole("button", { name: /log weekly update/i })).not.toBeInTheDocument();
    renderDialog("idle", IDLE, { userId: 99, isStaff: false, canReview: false });
    expect(screen.queryAllByRole("button", { name: /log weekly update/i })).toHaveLength(0);
  });

  it("staff can log on someone else's flag", () => {
    renderDialog("idle", { ...IDLE, flagged_by: 9 }, { userId: 1, isStaff: true, canReview: true });
    expect(screen.getByRole("button", { name: /log weekly update/i })).toBeInTheDocument();
  });

  it("shows an empty weekly log affordance", () => {
    renderDialog("idle", { ...IDLE, status_updates: [] });
    expect(screen.getByText("No weekly updates yet.")).toBeInTheDocument();
  });
});

describe("RecordDetailDialog — other kinds", () => {
  it("PIP: private evidence notes vs shared reviewer notes", () => {
    renderDialog("pips", {
      id: 6,
      employee: 20,
      employee_name: "Jane",
      tl: 1,
      tl_name: "Me",
      status: "active",
      start_date: "2026-09-06",
      approved_by: 9,
      approved_by_name: "HR Person",
      approved_at: "2026-09-07T10:00:00Z",
      notes: "Evidence list",
      shared_notes: "Weekly check-ins agreed",
      closed_on: null,
      status_note: "",
      reference_url: "https://example.com/pip",
    });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Evidence list")).toBeInTheDocument();
    expect(within(dialog).getByText("Weekly check-ins agreed")).toBeInTheDocument();
    expect(within(dialog).getByText(/shared with reviewers/i)).toBeInTheDocument();
    expect(within(dialog).getByText("Approved")).toBeInTheDocument();
    expect(within(dialog).getByText(/by HR Person/)).toBeInTheDocument();
  });

  it("promotion: decision note is shown without a privacy chip", () => {
    renderDialog("promotions", {
      id: 5,
      employee: 20,
      employee_name: "Jane",
      nominated_by: 1,
      nominated_by_name: "Me",
      nominated_on: "2026-09-05",
      status: "promoted",
      decided_on: "2026-09-10",
      decided_by: 9,
      decision_note: "Exceeded every goal",
      notes: "Fast learner",
    });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Exceeded every goal")).toBeInTheDocument();
    expect(within(dialog).getByText("Fast learner")).toBeInTheDocument();
  });

  it("absence and review render their notes blocks", () => {
    renderDialog("absences", {
      id: 3,
      employee: 20,
      employee_name: "Jane",
      flagged_by: 1,
      flagged_by_name: "Me",
      absence_date: "2026-09-01",
      reason: "Sick",
      addressed_on: "2026-09-03",
      notes: "Doctor note seen",
    });
    expect(screen.getByText("Doctor note seen")).toBeInTheDocument();
    renderDialog("reviews", {
      id: 4,
      leader: 1,
      leader_name: "Me",
      period: "2026-08",
      recipient: "GM",
      delivered_on: "2026-09-04",
      notes: "Deck attached",
    });
    expect(screen.getAllByText("Deck attached")).not.toHaveLength(0);
  });
});
