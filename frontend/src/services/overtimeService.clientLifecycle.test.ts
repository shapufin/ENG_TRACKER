import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { overtimeService } from "./overtimeService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

describe("overtimeService client lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("archives a client through its own action, never by editing is_active", async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { id: 4, is_active: false, users_unassigned: 2 },
    });
    const result = await overtimeService.archiveClient(4);
    expect(api.post).toHaveBeenCalledWith("/overtime/clients/4/archive/");
    expect(result.users_unassigned).toBe(2);
  });

  it("unarchives a client", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { id: 4, is_active: true } });
    await overtimeService.unarchiveClient(4);
    expect(api.post).toHaveBeenCalledWith("/overtime/clients/4/unarchive/");
  });

  it("loads the lifecycle info of a client", async () => {
    const info = {
      is_active: false,
      assigned_users: 0,
      counts: {},
      cascade_counts: {},
      last_activity: null,
      can_delete: true,
      blockers: [],
    };
    vi.mocked(api.get).mockResolvedValue({ data: info });
    await expect(overtimeService.getClientLifecycle(4)).resolves.toEqual(info);
    expect(api.get).toHaveBeenCalledWith("/overtime/clients/4/lifecycle/");
  });
});
