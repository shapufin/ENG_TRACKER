import { describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { controlRoomService } from "./controlRoomService";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("controlRoomService", () => {
  it("uses the registered underscore plugin route for self access", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { has_access: false, is_global: false, team_ids: [], access: null },
    });

    await controlRoomService.getMe();

    expect(api.get).toHaveBeenCalledWith("/plugins/control_room/access/me/");
  });

  it("uses the registered underscore plugin route for dashboard data", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    const params = {
      date_from: "2026-07-26",
      date_to: "2026-08-01",
      team_ids: undefined,
      status_mode: "pending_approved" as const,
      include_rejected: false,
    };

    await controlRoomService.getRoster(params);

    expect(api.get).toHaveBeenCalledWith("/plugins/control_room/dashboard/roster/", {
      params,
    });
  });
});
