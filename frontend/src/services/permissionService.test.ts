import { describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { permissionService } from "./permissionService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
  __esModule: true,
}));

describe("permissionService.getAllGroups", () => {
  it("loads every page of groups", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({
        data: {
          count: 2,
          next: "/api/permissions/groups/?page=2",
          previous: null,
          results: [{ id: 1, name: "First" }],
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          count: 2,
          next: null,
          previous: "/api/permissions/groups/?page=1",
          results: [{ id: 2, name: "Second" }],
        },
      } as never);

    await expect(permissionService.getAllGroups()).resolves.toEqual([
      { id: 1, name: "First" },
      { id: 2, name: "Second" },
    ]);
    expect(api.get).toHaveBeenNthCalledWith(1, "/permissions/groups/", { params: { page: 1 } });
    expect(api.get).toHaveBeenNthCalledWith(2, "/permissions/groups/", { params: { page: 2 } });
  });
});
