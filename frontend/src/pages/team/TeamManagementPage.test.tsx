import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import TeamManagementPage from "./TeamManagementPage";
import { overtimeService } from "@/services/overtimeService";
import { standbyService } from "@/services/standbyService";
import { leaveService } from "@/services/leaveService";
import { userService } from "@/services/userService";

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => ({ canManageTeam: true }),
}));

vi.mock("@/services/overtimeService", () => ({
  overtimeService: {
    getTeamLogs: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    bulkApprove: vi.fn(),
    bulkReject: vi.fn(),
    bulkDelete: vi.fn(),
  },
}));

vi.mock("@/services/standbyService", () => ({
  standbyService: {
    getTeamLogs: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    bulkApprove: vi.fn(),
    bulkReject: vi.fn(),
    bulkDelete: vi.fn(),
  },
}));

vi.mock("@/services/leaveService", () => ({
  leaveService: {
    getTeamLogs: vi.fn(),
    getTeamBalances: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    bulkApprove: vi.fn(),
    bulkReject: vi.fn(),
  },
}));

vi.mock("@/services/userService", () => ({
  userService: { getMyTeamMembers: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const renderPage = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TeamManagementPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("TeamManagementPage selection & bulk actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(overtimeService.getTeamLogs).mockResolvedValue({
      results: [
        {
          id: 101,
          user: 1,
          user_name: "alice",
          user_full_name: "Alice Smith",
          date: "2026-11-24",
          hours: 2,
          status: "pending",
          client_name: "Acme",
          ticket_references: ["ENG-1"],
          description: "Deploy",
          is_carried_over: false,
          created_at: "2026-11-24T10:00:00Z",
          updated_at: "2026-11-24T10:00:00Z",
        },
        {
          id: 102,
          user: 2,
          user_name: "bob",
          user_full_name: "Bob Jones",
          date: "2026-11-25",
          hours: 3,
          status: "pending",
          client_name: "Acme",
          ticket_references: ["ENG-2"],
          description: "Incident",
          is_carried_over: false,
          created_at: "2026-11-25T10:00:00Z",
          updated_at: "2026-11-25T10:00:00Z",
        },
      ],
      next: null,
      count: 2,
    } as any);
    vi.mocked(standbyService.getTeamLogs).mockResolvedValue({ results: [], next: null } as any);
    vi.mocked(leaveService.getTeamLogs).mockResolvedValue({ results: [], next: null } as any);
    vi.mocked(leaveService.getTeamBalances).mockResolvedValue([] as any);
    vi.mocked(userService.getMyTeamMembers).mockResolvedValue([
      { user: { id: 1, first_name: "Alice", last_name: "Smith" }, teams_detail: [] },
      { user: { id: 2, first_name: "Bob", last_name: "Jones" }, teams_detail: [] },
    ] as any);
    vi.mocked(overtimeService.bulkApprove).mockResolvedValue({
      approved_count: 1,
      failed_ids: [],
    } as any);
    vi.mocked(overtimeService.bulkReject).mockResolvedValue({
      rejected_count: 1,
      failed_ids: [],
    } as any);
  });

  it("shows bulk operations panel when a row is selected and sends typed reject reason", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBeGreaterThan(1);
    fireEvent.click(checkboxes[1]);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: /^reject$/i }));
    const reasonInput = await screen.findByLabelText(/rejection reason/i);
    fireEvent.change(reasonInput, { target: { value: "Missing ticket reference" } });
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    await waitFor(() =>
      expect(overtimeService.bulkReject).toHaveBeenCalledWith([102], "Missing ticket reference")
    );
  });

  it("bulk approves selected rows", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^confirm$/i }));

    await waitFor(() => expect(overtimeService.bulkApprove).toHaveBeenCalledWith([102]));
  });

  it("clears selection when switching tabs or changing filters", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument()
    );

    fireEvent.mouseDown(screen.getByRole("tab", { name: /standby/i }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^approve$/i })).not.toBeInTheDocument()
    );
  });

  it("clears selection when collapsing a monthly section", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^approve$/i })).toBeInTheDocument()
    );

    const monthButton = screen.getByRole("button", { name: /november 2026/i });
    fireEvent.click(monthButton);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^approve$/i })).not.toBeInTheDocument()
    );
  });
});
