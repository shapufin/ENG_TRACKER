import { describe, it, expect, vi, beforeEach } from "vitest";
import api from "@/lib/api";
import { calendarAdminService } from "./calendarAdminService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), put: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

describe("calendarAdminService URL contracts", () => {
  it("listWorkspaces calls /dashboard/calendar-workspaces/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await calendarAdminService.listWorkspaces();
    expect(api.get).toHaveBeenCalledWith("/dashboard/calendar-workspaces/");
  });

  it("createWorkspace POSTs to /dashboard/calendar-workspaces/", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as any);
    await calendarAdminService.createWorkspace({ name: "WS", code: "ws" });
    expect(api.post).toHaveBeenCalledWith("/dashboard/calendar-workspaces/", {
      name: "WS",
      code: "ws",
    });
  });

  it("updateWorkspace PUTs /dashboard/calendar-workspaces/:id/", async () => {
    vi.mocked(api.put).mockResolvedValue({ data: {} } as any);
    await calendarAdminService.updateWorkspace(1, { name: "Updated" });
    expect(api.put).toHaveBeenCalledWith("/dashboard/calendar-workspaces/1/", { name: "Updated" });
  });

  it("deleteWorkspace DELETEs /dashboard/calendar-workspaces/:id/", async () => {
    vi.mocked(api.delete).mockResolvedValue({} as any);
    await calendarAdminService.deleteWorkspace(2);
    expect(api.delete).toHaveBeenCalledWith("/dashboard/calendar-workspaces/2/");
  });

  it("listHolidays calls /dashboard/holidays/", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await calendarAdminService.listHolidays();
    expect(api.get).toHaveBeenCalledWith("/dashboard/holidays/", { params: undefined });
  });

  it("never uses /api/ prefix", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as any);
    await calendarAdminService.listWorkspaces();
    const url = vi.mocked(api.get).mock.calls[0][0];
    expect(url).not.toMatch(/^\/api\//);
  });
});
