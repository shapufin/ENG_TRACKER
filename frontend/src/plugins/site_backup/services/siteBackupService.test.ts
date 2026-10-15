import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ default: { post, get, delete: vi.fn() } }));
vi.mock("@/lib/download", () => ({ downloadBlobResponse: vi.fn() }));

import { siteBackupService } from "./siteBackupService";

// The app-wide axios timeout is 10s; a full-site dump/restore takes longer, so
// the client gave up ("Connection Error") while the server kept working and a
// retry produced a duplicate backup.
describe("siteBackupService long-running requests", () => {
  beforeEach(() => {
    post.mockReset().mockResolvedValue({ data: {} });
    get.mockReset().mockResolvedValue({ data: new Blob() });
  });

  const timeoutOf = (call: unknown[]) => (call[call.length - 1] as { timeout?: number }).timeout;

  it("gives createBackup far longer than the default timeout", async () => {
    await siteBackupService.createBackup("", false);
    expect(timeoutOf(post.mock.calls[0])).toBeGreaterThanOrEqual(120_000);
  });

  it("gives restore preview and commit far longer than the default timeout", async () => {
    await siteBackupService.previewRestore({ backupId: 1 });
    await siteBackupService.commitRestore({ backupId: 1 }, { approvedModels: [], confirmed: true });
    expect(timeoutOf(post.mock.calls[0])).toBeGreaterThanOrEqual(120_000);
    expect(timeoutOf(post.mock.calls[1])).toBeGreaterThanOrEqual(120_000);
  });

  it("gives backup download far longer than the default timeout", async () => {
    await siteBackupService.downloadBackup({ id: 1, filename: "b.zip" } as never);
    expect(timeoutOf(get.mock.calls[0])).toBeGreaterThanOrEqual(120_000);
  });
});
