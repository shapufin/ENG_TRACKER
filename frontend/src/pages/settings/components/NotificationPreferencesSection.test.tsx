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
    globally_enabled: true,
  },
];

describe("NotificationPreferencesSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders role-filtered preferences and independent channels", async () => {
    vi.mocked(notificationService.getPreferences).mockResolvedValue(preferences);
    render(<NotificationPreferencesSection isSubscribed isSubscribing={false} />);

    expect(await screen.findByText("My leave approved or rejected")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /in-app notifications/i })).toBeChecked();
    expect(screen.getByRole("switch", { name: /push notifications/i })).toBeChecked();
  });

  it("optimistically updates, then reconciles with the server's full preference list", async () => {
    vi.mocked(notificationService.getPreferences).mockResolvedValue(preferences);
    // Backend PATCH /preferences/ responds with the full current list, not
    // just the changed row.
    vi.mocked(notificationService.updatePreference).mockResolvedValue([
      { ...preferences[0], push_enabled: false },
    ]);
    render(<NotificationPreferencesSection isSubscribed isSubscribing={false} />);

    const push = await screen.findByRole("switch", { name: /push notifications/i });
    fireEvent.click(push);

    await waitFor(() =>
      expect(notificationService.updatePreference).toHaveBeenCalledWith("own_leave_updated", {
        push_enabled: false,
      })
    );
    await waitFor(() => expect(push).not.toBeChecked());
  });

  it("rolls back only the toggled channel when persistence fails, leaving other rows untouched", async () => {
    vi.mocked(notificationService.getPreferences).mockResolvedValue([
      ...preferences,
      {
        event_type: "own_overtime_submitted",
        label: "My overtime submitted",
        in_app_enabled: true,
        push_enabled: true,
        available: true,
        globally_enabled: true,
      },
    ]);
    vi.mocked(notificationService.updatePreference).mockRejectedValue(new Error("offline"));
    render(<NotificationPreferencesSection isSubscribed isSubscribing={false} />);

    const inApp = await screen.findByRole("switch", {
      name: "My leave approved or rejected: in-app notifications",
    });
    fireEvent.click(inApp);

    await waitFor(() => expect(inApp).toBeChecked());
    // The other row's switches were never touched and stay checked.
    expect(
      screen.getByRole("switch", { name: "My overtime submitted: in-app notifications" })
    ).toBeChecked();
  });

  it("disables the push switch while the device isn't subscribed, without a blocking click handler", async () => {
    vi.mocked(notificationService.getPreferences).mockResolvedValue([
      { ...preferences[0], push_enabled: false },
    ]);
    render(<NotificationPreferencesSection isSubscribed={false} isSubscribing={false} />);

    const push = await screen.findByRole("switch", { name: /push notifications/i });
    expect(push).toBeDisabled();
  });

  it("shows an admin-disabled note when a category is globally disabled", async () => {
    vi.mocked(notificationService.getPreferences).mockResolvedValue([
      { ...preferences[0], globally_enabled: false },
    ]);
    render(<NotificationPreferencesSection isSubscribed isSubscribing={false} />);

    expect(await screen.findByText(/Disabled by admin/)).toBeInTheDocument();
  });
});
