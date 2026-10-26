import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PreviousYearsPage } from "./PreviousYearsPage";
import { yearCloseService } from "../services/yearCloseService";
import * as download from "@/lib/download";

const permissions = vi.hoisted(() => ({ isSuperuser: true }));

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => ({ isSuperuser: permissions.isSuperuser }),
}));
vi.mock("../services/yearCloseService", () => ({
  yearCloseService: {
    listSnapshots: vi.fn(),
    listFiles: vi.fn(),
    getDownloadUrl: vi.fn(),
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

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PreviousYearsPage />
    </QueryClientProvider>
  );
};

describe("PreviousYearsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissions.isSuperuser = true;
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
  });

  it("lists closed years with their status", async () => {
    vi.mocked(yearCloseService.listSnapshots).mockResolvedValue([snapshot()]);
    renderPage();
    expect(await screen.findByText("2025")).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  it("explains a blocked year instead of hiding it", async () => {
    vi.mocked(yearCloseService.listSnapshots).mockResolvedValue([
      snapshot({ status: "blocked", readiness: { blockers: ["3 overtime entries are still pending."] } }),
    ]);
    renderPage();
    await screen.findByText("2025");
    expect(screen.getByRole("button", { name: "Files for 2025" })).toBeInTheDocument();
  });

  it("shows the files of the selected year and downloads one by signed link", async () => {
    vi.mocked(yearCloseService.listSnapshots).mockResolvedValue([snapshot()]);
    vi.mocked(yearCloseService.listFiles).mockResolvedValue([file()]);
    vi.mocked(yearCloseService.getDownloadUrl).mockResolvedValue("/api/x/download/?token=t");
    renderPage();

    await screen.findByText("2025");
    screen.getByRole("button", { name: "Files for 2025" }).click();

    const downloadButton = await screen.findByRole("button", { name: /Download/ });
    downloadButton.click();
    await waitFor(() => expect(yearCloseService.getDownloadUrl).toHaveBeenCalledWith(7));
    await waitFor(() =>
      expect(download.navigateToDownload).toHaveBeenCalledWith("/api/x/download/?token=t")
    );
  });

  it("offers no delete control anywhere", async () => {
    vi.mocked(yearCloseService.listSnapshots).mockResolvedValue([snapshot()]);
    vi.mocked(yearCloseService.listFiles).mockResolvedValue([file()]);
    renderPage();
    await screen.findByText("2025");
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
  });
});
