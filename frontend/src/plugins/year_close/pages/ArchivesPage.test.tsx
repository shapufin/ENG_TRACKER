import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArchivesPage } from "./ArchivesPage";
import { yearCloseService } from "../services/yearCloseService";
import * as download from "@/lib/download";
import { toast } from "sonner";

const permissions = vi.hoisted(() => ({ isSuperuser: true }));

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => ({ isSuperuser: permissions.isSuperuser }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../services/yearCloseService", () => ({
  yearCloseService: {
    listSnapshots: vi.fn(),
    listArchives: vi.fn(),
    getDownloadUrl: vi.fn(),
    verifyFile: vi.fn(),
    listLeaderHistory: vi.fn(),
    exportLeader: vi.fn(),
    purgeCategory: vi.fn(),
  },
}));
vi.mock("@/lib/download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/download")>()),
  navigateToDownload: vi.fn(),
}));

const snapshot = (overrides = {}) => ({
  id: 1,
  year: 2025,
  version: 1,
  status: "ready" as const,
  readiness: { blockers: [], warnings: [] },
  started_at: "2026-02-01T10:00:00Z",
  completed_at: "2026-02-01T10:05:00Z",
  total_bytes: 2048,
  file_count: 2,
  created_at: "2026-02-01T10:00:00Z",
  ...overrides,
});

const file = (overrides = {}) => ({
  id: 7,
  kind: "company" as const,
  leader_name: "",
  team_name: "",
  sha256: "a".repeat(64),
  size: 1024,
  status: "ready" as const,
  error: "",
  created_at: "2026-02-01T10:00:00Z",
  ...overrides,
});

const entry = (overrides = {}) => ({
  year: 2025,
  snapshot_id: 1,
  version: 1,
  completed_at: "2026-02-01T10:05:00Z",
  total_bytes: 2048,
  categories: [
    {
      key: "payroll",
      label: "Payroll",
      count: 12,
      location: "company" as const,
      retention_years: 5,
      remove_on: "2030-12-31",
      removable: false,
      purged_at: null as string | null,
      notice_sent_on: null as string | null,
    },
    {
      key: "overtime",
      label: "Overtime",
      count: 40,
      location: "team" as const,
      retention_years: 3,
      remove_on: "2028-12-31",
      removable: true,
      purged_at: null as string | null,
      notice_sent_on: "2028-12-01" as string | null,
    },
  ],
  files: [file()],
  ...overrides,
});

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ArchivesPage />
    </QueryClientProvider>
  );
};

describe("ArchivesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions.isSuperuser = true;
    vi.mocked(yearCloseService.listArchives).mockResolvedValue([entry()]);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
    );
  });

  it("refuses a non-superuser, even though the route admits staff", () => {
    permissions.isSuperuser = false;
    renderPage();
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
    expect(yearCloseService.listSnapshots).not.toHaveBeenCalled();
    expect(yearCloseService.listArchives).not.toHaveBeenCalled();
  });

  it("lists closed years with their status", async () => {
    vi.mocked(yearCloseService.listSnapshots).mockResolvedValue([snapshot()]);
    renderPage();
    expect(await screen.findByText("2025")).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  it("explains a blocked year instead of hiding it", async () => {
    vi.mocked(yearCloseService.listSnapshots).mockResolvedValue([
      snapshot({
        status: "blocked",
        readiness: { blockers: ["3 overtime entries are still pending."] },
      }),
    ]);
    vi.mocked(yearCloseService.listArchives).mockResolvedValue([]);
    renderPage();
    await screen.findByText("2025");
    screen.getByRole("button", { name: "Files for 2025" }).click();
    expect(await screen.findByText("3 overtime entries are still pending.")).toBeInTheDocument();
  });

  it("shows each category with its count and removal date, and keeps payroll longer", async () => {
    vi.mocked(yearCloseService.listSnapshots).mockResolvedValue([snapshot()]);
    renderPage();
    await screen.findByText("2025");
    screen.getByRole("button", { name: "Files for 2025" }).click();

    expect(await screen.findByText("2025 contents and retention")).toBeInTheDocument();
    expect(screen.getByText("Payroll")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getAllByText(/kept until/).length).toBe(2);
  });

  it("downloads a file by signed link and verifies one with a clear result", async () => {
    vi.mocked(yearCloseService.listSnapshots).mockResolvedValue([snapshot()]);
    vi.mocked(yearCloseService.getDownloadUrl).mockResolvedValue("/api/x/download/?token=t");
    vi.mocked(yearCloseService.verifyFile).mockResolvedValue("mismatch");
    renderPage();
    await screen.findByText("2025");
    screen.getByRole("button", { name: "Files for 2025" }).click();

    (await screen.findByRole("button", { name: /Download/ })).click();
    await waitFor(() => expect(yearCloseService.getDownloadUrl).toHaveBeenCalledWith(7));
    await waitFor(() =>
      expect(download.navigateToDownload).toHaveBeenCalledWith("/api/x/download/?token=t")
    );

    screen.getByRole("button", { name: /Verify/ }).click();
    await waitFor(() => expect(yearCloseService.verifyFile).toHaveBeenCalledWith(7));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("does not match"))
    );
  });

  it("offers no delete control anywhere", async () => {
    vi.mocked(yearCloseService.listSnapshots).mockResolvedValue([snapshot()]);
    renderPage();
    await screen.findByText("2025");
    screen.getByRole("button", { name: "Files for 2025" }).click();
    await screen.findByText("2025 contents and retention");
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
  });

  it("opens the leader history tab and exports one leader", async () => {
    vi.mocked(yearCloseService.listSnapshots).mockResolvedValue([snapshot()]);
    vi.mocked(yearCloseService.listLeaderHistory).mockResolvedValue([
      {
        leader_id: 5,
        username: "old_lead",
        name: "Old Lead",
        is_current: false,
        scorecard_months: 12,
        engagement_months: 12,
        governance_evidence: 2,
        leader_records: 4,
      },
    ]);
    vi.mocked(yearCloseService.exportLeader).mockResolvedValue(new Blob(["x"]));
    vi.spyOn(download, "downloadBlobResponse").mockImplementation(() => {});
    renderPage();
    await screen.findByText("2025");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Leader history" }));

    expect(await screen.findByText("Old Lead")).toBeInTheDocument();
    expect(screen.getByText("Former")).toBeInTheDocument();
    screen.getByRole("button", { name: /Export Old Lead 2025/ }).click();
    await waitFor(() => expect(yearCloseService.exportLeader).toHaveBeenCalledWith(2025, 5));
  });

  const openRemoveDialog = async () => {
    vi.mocked(yearCloseService.listSnapshots).mockResolvedValue([snapshot()]);
    renderPage();
    await screen.findByText("2025");
    screen.getByRole("button", { name: "Files for 2025" }).click();
    (await screen.findByRole("button", { name: "Remove Overtime of 2025" })).click();
  };

  it("offers removal only for a category past its date, and previews before deleting", async () => {
    vi.mocked(yearCloseService.purgeCategory).mockResolvedValue({
      year: 2025,
      category: "overtime",
      dry_run: true,
      rows: { "Overtime entries": 40 },
    });
    await openRemoveDialog();
    expect(screen.queryByRole("button", { name: "Remove Payroll of 2025" })).not.toBeInTheDocument();

    expect(await screen.findByText("Overtime entries")).toBeInTheDocument();
    expect(yearCloseService.purgeCategory).toHaveBeenCalledWith(2025, "overtime", true);
    expect(yearCloseService.purgeCategory).not.toHaveBeenCalledWith(2025, "overtime", false);

    screen.getByRole("button", { name: "Remove permanently" }).click();
    await waitFor(() =>
      expect(yearCloseService.purgeCategory).toHaveBeenCalledWith(2025, "overtime", false)
    );
  });

  it("shows why a removal is refused and keeps confirm disabled", async () => {
    vi.mocked(yearCloseService.purgeCategory).mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { reasons: ["The final removal notice is missing."] } },
    });
    await openRemoveDialog();
    expect(await screen.findByText("The final removal notice is missing.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove permanently" })).toBeDisabled();
  });

  it("shows a removed category as removed, with no button", async () => {
    vi.mocked(yearCloseService.listSnapshots).mockResolvedValue([snapshot()]);
    const base = entry();
    base.categories[1] = { ...base.categories[1], purged_at: "2029-01-20T10:00:00+00:00" };
    vi.mocked(yearCloseService.listArchives).mockResolvedValue([base]);
    renderPage();
    await screen.findByText("2025");
    screen.getByRole("button", { name: "Files for 2025" }).click();
    expect(await screen.findByText(/Removed on/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Overtime of 2025" })).not.toBeInTheDocument();
  });
});
