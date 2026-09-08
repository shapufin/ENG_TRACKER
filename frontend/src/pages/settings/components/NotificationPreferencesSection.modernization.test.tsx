import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotificationPreferencesSection } from "./NotificationPreferencesSection";
import { notificationService } from "@/plugins/notifications/service";

vi.mock("@/plugins/notifications/service", () => ({
  notificationService: { getPreferences: vi.fn(), updatePreference: vi.fn() },
}));
vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({
    isSupported: true,
    isSubscribed: true,
    isSubscribing: false,
    error: null,
    permission: "granted",
    pushAvailability: "available",
    subscribe: vi.fn(),
  }),
}));

describe("NotificationPreferencesSection modernization", () => {
  it("renders each channel in a bordered toggle row", async () => {
    vi.mocked(notificationService.getPreferences).mockResolvedValue([
      {
        event_type: "own_leave_updated",
        label: "My leave approved or rejected",
        in_app_enabled: true,
        push_enabled: false,
        available: true,
      },
    ]);
    const { container } = render(<NotificationPreferencesSection />);

    await screen.findByText("My leave approved or rejected");
    const rows = container.querySelectorAll(".rounded-lg.border");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
