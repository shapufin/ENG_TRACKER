import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const preview = vi.hoisted(() => vi.fn(() => ({ data: undefined })));
const state = vi.hoisted(() => ({ isAdmin: true, editing: null as { id: number } | null }));

vi.mock("./hooks/useOvertimeHoursPreview", () => ({
  useOvertimeHoursPreview: preview,
  previewNote: () => null,
}));
vi.mock("@/pages/hours_logs/components/useHoursLogPageContext", () => ({
  useHoursLogPageContext: () => ({
    userId: 1,
    canApprove: false,
    isAdmin: state.isAdmin,
    isSuperuser: false,
    canViewTeamData: false,
    queryClient: {},
  }),
}));
vi.mock("./hooks/useOvertimeForm", () => ({
  useOvertimeForm: () => ({
    formOpen: true,
    setFormOpen: vi.fn(),
    editing: state.editing,
    form: { date: "2026-10-26", start_time: "08:00", end_time: "09:00", user: "7" },
    formErrors: {},
    resetForm: vi.fn(),
    openCreate: vi.fn(),
    openEdit: vi.fn(),
    validateForm: vi.fn(),
    previewHours: vi.fn(),
    buildPayload: vi.fn(),
    setForm: vi.fn(),
    setFormErrors: vi.fn(),
  }),
}));
vi.mock("@/pages/hours_logs/components/useHoursLogPageSetup", () => ({
  useHoursLogPageSetup: () => ({ rowSelection: {}, queryCallbacks: {} }),
}));
vi.mock("@/hooks/useOvertimeQueries", () => ({
  useOvertimeQueries: () => ({
    logs: [],
    summary: null,
    clients: [],
    users: [],
    isLoading: false,
    createMutation: {},
    updateMutation: {},
    deleteMutation: {},
    approveMutation: {},
    rejectMutation: {},
  }),
}));
vi.mock("@/hooks/useBulkOperations", () => ({ useBulkOperations: () => ({ bulkDeleteMutation: {} }) }));
vi.mock("@/pages/hours_logs/components/useHoursLogSubmit", () => ({ useHoursLogSubmit: () => vi.fn() }));
vi.mock("./hooks/useOvertimeColumns", () => ({ useOvertimeColumns: () => [] }));
vi.mock("@/components/layout/PageShell", () => ({ PageShell: () => null }));

import { OvertimePage } from "./OvertimePage";

const lastArgs = () => (preview.mock.calls.at(-1) as unknown as [{ user?: string }])[0];

describe("OvertimePage hours preview target", () => {
  beforeEach(() => preview.mockClear());

  it("previews against the employee when an admin edits their entry", () => {
    state.isAdmin = true;
    state.editing = { id: 5 };
    render(<OvertimePage />);
    expect(lastArgs().user).toBe("7");
  });

  it("previews against the chosen employee when an admin adds an entry", () => {
    state.isAdmin = true;
    state.editing = null;
    render(<OvertimePage />);
    expect(lastArgs().user).toBe("7");
  });

  it("never names a user for a non-admin", () => {
    state.isAdmin = false;
    state.editing = { id: 5 };
    render(<OvertimePage />);
    expect(lastArgs().user).toBeUndefined();
  });
});
