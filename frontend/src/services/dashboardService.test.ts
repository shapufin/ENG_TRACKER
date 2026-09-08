import { describe, it, expect, vi } from "vitest";
import { dashboardService } from "./dashboardService";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

describe("dashboardService.saveDashboardLayout", () => {
  it("updates existing preference when results exist", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [{ id: 1, layout: {} }] } });
    vi.mocked(api.put).mockResolvedValue({ data: { id: 1, layout: { widgets: [] } } });

    const result = await dashboardService.saveDashboardLayout({ widgets: [] }, "admin");
    expect(api.put).toHaveBeenCalledWith("/dashboard/preferences/1/", {
      dashboard_type: "admin",
      layout: { widgets: [] },
    });
    expect(result).toEqual({ id: 1, layout: { widgets: [] } });
  });

  it("creates new preference when no existing results", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [] } });
    vi.mocked(api.post).mockResolvedValue({ data: { id: 2, layout: { widgets: [] } } });

    const result = await dashboardService.saveDashboardLayout({ widgets: [] }, "admin");
    expect(api.post).toHaveBeenCalledWith("/dashboard/preferences/", {
      dashboard_type: "admin",
      layout: { widgets: [] },
    });
    expect(result).toEqual({ id: 2, layout: { widgets: [] } });
  });

  it("creates new preference when get fails", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("not found"));
    vi.mocked(api.post).mockResolvedValue({ data: { id: 3, layout: { widgets: [] } } });

    const result = await dashboardService.saveDashboardLayout({ widgets: [] }, "employee");
    expect(api.post).toHaveBeenCalledWith("/dashboard/preferences/", {
      dashboard_type: "employee",
      layout: { widgets: [] },
    });
    expect(result).toEqual({ id: 3, layout: { widgets: [] } });
  });
});
