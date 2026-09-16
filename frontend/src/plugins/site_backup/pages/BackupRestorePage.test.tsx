import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BackupRestorePage } from "./BackupRestorePage";

const usePermissions = vi.fn();
const listBackups = vi.fn();
const createBackup = vi.fn();

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => usePermissions(),
}));

vi.mock("../services/siteBackupService", () => ({
  siteBackupService: {
    listBackups: () => listBackups(),
    createBackup: (note: string, includeMedia: boolean) => createBackup(note, includeMedia),
    deleteBackup: vi.fn(),
    downloadBackup: vi.fn(),
    previewRestore: vi.fn(),
    commitRestore: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BackupRestorePage />
    </QueryClientProvider>
  );

beforeEach(() => {
  listBackups.mockResolvedValue([]);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("BackupRestorePage", () => {
  it("denies access to non-superusers", () => {
    usePermissions.mockReturnValue({ isSuperuser: false });
    renderPage();
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
  });

  it("lists backups for superusers", async () => {
    usePermissions.mockReturnValue({ isSuperuser: true });
    listBackups.mockResolvedValue([
      {
        id: 1,
        filename: "backup_20260101_000000.zip",
        size_bytes: 2048,
        checksum: "abc",
        migration_state_hash: "xyz",
        db_row_count: 42,
        media_file_count: 3,
        note: "manual",
        created_by_username: "root",
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
    renderPage();
    expect(await screen.findByText("backup_20260101_000000.zip")).toBeInTheDocument();
  });

  it("creates a backup via the form", async () => {
    usePermissions.mockReturnValue({ isSuperuser: true });
    createBackup.mockResolvedValue({
      id: 2,
      filename: "backup_new.zip",
      size_bytes: 10,
      checksum: "a",
      migration_state_hash: "b",
      db_row_count: 1,
      media_file_count: 0,
      note: "",
      created_by_username: "root",
      created_at: "2026-01-01T00:00:00Z",
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /create backup/i }));
    await waitFor(() => expect(createBackup).toHaveBeenCalledWith("", true));
  });
});
