import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { userService } from "./userService";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
  },
}));

describe("userService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the scoped Control Room eligible-user endpoint", async () => {
    const response = {
      count: 1,
      next: null,
      previous: null,
      results: [
        { id: 7, username: "target", email: "target@example.com", full_name: "Target User" },
      ],
    };
    vi.mocked(api.get).mockResolvedValue({ data: response });

    await expect(
      userService.getEligibleControlRoomUsers({ search: "target", page_size: 20 })
    ).resolves.toEqual(response);

    expect(api.get).toHaveBeenCalledWith("/users/users/eligible_for_control_room/", {
      params: { search: "target", page_size: 20 },
    });
  });
});
