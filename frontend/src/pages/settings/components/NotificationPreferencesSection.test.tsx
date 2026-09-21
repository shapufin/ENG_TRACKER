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

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
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

  it("renders role-filtered preferences", async () => {
    vi.mocked(notificationService.getPreferences).mockResolvedValue(preferences);
    render(<NotificationPreferencesSection />);

    expect(await screen.findByText("My leave approved or rejected")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /in-app notifications/i })).toBeChecked();
  });

  it("optimistically updates, then reconciles with the server's full preference list", async () => {
    vi.mocked(notificationService.getPreferences).mockResolvedValue(preferences);
    // Backend PATCH /preferences/ responds with the full current list, not
    // just the changed row.
    vi.mocked(notificationService.updatePreference).mockResolvedValue([
      { ...preferences[0], in_app_enabled: false },
    ]);
    render(<NotificationPreferencesSection />);

    const inApp = await screen.findByRole("switch", { name: /in-app notifications/i });
    fireEvent.click(inApp);

    await waitFor(() =>
      expect(notificationService.updatePreference).toHaveBeenCalledWith("own_leave_updated", {
        in_app_enabled: false,
      })
    );
    await waitFor(() => expect(inApp).not.toBeChecked());
  });

  it("rolls back only the toggled row when persistence fails, leaving other rows untouched", async () => {
    vi.mocked(notificationService.getPreferences).mockResolvedValue([
      ...preferences,
      {
        event_type: "own_overtime_submitted",
        label: "My overtime submitted",
        in_app_enabled: true,
        push_enabled: true,
        available: true,
      },
    ]);
    vi.mocked(notificationService.updatePreference).mockRejectedValue(new Error("offline"));
    render(<NotificationPreferencesSection />);

    const inApp = await screen.findByRole("switch", {
      name: "My leave approved or rejected: in-app notifications",
    });
    fireEvent.click(inApp);

    await waitFor(() => expect(inApp).toBeChecked());
    // The other row's switch was never touched and stays checked.
    expect(
      screen.getByRole("switch", { name: "My overtime submitted: in-app notifications" })
    ).toBeChecked();
  });
});
