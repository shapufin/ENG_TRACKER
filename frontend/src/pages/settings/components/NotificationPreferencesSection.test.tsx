import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NotificationPreferencesSection } from "./NotificationPreferencesSection";
import { notificationService } from "@/plugins/notifications/service";

vi.mock("@/plugins/notifications/service", () => ({
  notificationService: {
    getPreferences: vi.fn(),
    updatePreference: vi.fn(),
  },
}));

const preferences = [
  {
    event_type: "own_leave_updated",
    label: "My leave approved or rejected",
    in_app_enabled: true,
    push_enabled: true,
    available: true,
  },
];

describe("NotificationPreferencesSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders role-filtered preferences and independent channels", async () => {
    vi.mocked(notificationService.getPreferences).mockResolvedValue(preferences);
    render(<NotificationPreferencesSection />);

    expect(await screen.findByText("My leave approved or rejected")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /in-app notifications/i })).toBeChecked();
    expect(screen.getByRole("switch", { name: /push notifications/i })).toBeChecked();
  });

  it("optimistically updates and persists a channel", async () => {
    vi.mocked(notificationService.getPreferences).mockResolvedValue(preferences);
    vi.mocked(notificationService.updatePreference).mockResolvedValue({
      ...preferences[0],
      push_enabled: false,
    });
    render(<NotificationPreferencesSection />);

    const push = await screen.findByRole("switch", { name: /push notifications/i });
    fireEvent.click(push);

    await waitFor(() =>
      expect(notificationService.updatePreference).toHaveBeenCalledWith("own_leave_updated", {
        in_app_enabled: true,
        push_enabled: false,
      })
    );
  });

  it("rolls back when persistence fails", async () => {
    vi.mocked(notificationService.getPreferences).mockResolvedValue(preferences);
    vi.mocked(notificationService.updatePreference).mockRejectedValue(new Error("offline"));
    render(<NotificationPreferencesSection />);

    const inApp = await screen.findByRole("switch", { name: /in-app notifications/i });
    fireEvent.click(inApp);

    await waitFor(() => expect(inApp).toBeChecked());
  });
});
