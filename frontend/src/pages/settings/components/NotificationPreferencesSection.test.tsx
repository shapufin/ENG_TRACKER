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

  it("does not let one row's server response undo another row's in-flight toggle", async () => {
    const second = {
      event_type: "own_leave_submitted",
      label: "My leave submitted",
      in_app_enabled: true,
      push_enabled: true,
      available: true,
    };
    vi.mocked(notificationService.getPreferences).mockResolvedValue([preferences[0], second]);
    // Row one's response was computed before row two's toggle landed, so it
    // still reports row two as enabled.
    let resolveFirst: (rows: typeof preferences) => void = () => {};
    vi.mocked(notificationService.updatePreference)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockImplementationOnce(() => new Promise(() => {}));
    render(<NotificationPreferencesSection />);

    const [firstInApp, secondInApp] = await screen.findAllByRole("switch", {
      name: /in-app notifications/i,
    });
    fireEvent.click(firstInApp);
    fireEvent.click(secondInApp);
    expect(secondInApp).not.toBeChecked();

    resolveFirst([{ ...preferences[0], in_app_enabled: false }, second]);
    await waitFor(() => expect(firstInApp).not.toBeChecked());
    expect(secondInApp).not.toBeChecked();
  });

  it("offers an independent push switch per category", async () => {
    vi.mocked(notificationService.getPreferences).mockResolvedValue(preferences);
    vi.mocked(notificationService.updatePreference).mockResolvedValue([
      { ...preferences[0], push_enabled: false },
    ]);
    render(<NotificationPreferencesSection />);

    const push = await screen.findByRole("switch", { name: /push notifications/i });
    expect(push).toBeChecked();
    fireEvent.click(push);

    await waitFor(() =>
      expect(notificationService.updatePreference).toHaveBeenCalledWith("own_leave_updated", {
        push_enabled: false,
      })
    );
    await waitFor(() => expect(push).not.toBeChecked());
  });

  it("groups the five HBPR governance categories under their own heading", async () => {
    vi.mocked(notificationService.getPreferences).mockResolvedValue([
      ...preferences,
      {
        event_type: "hbpr_meetings",
        label: "Meetings & cadence",
        in_app_enabled: true,
        push_enabled: false,
        available: true,
      },
      {
        event_type: "hbpr_epr",
        label: "EPR participation",
        in_app_enabled: true,
        push_enabled: false,
        available: true,
      },
    ]);
    render(<NotificationPreferencesSection />);

    expect(await screen.findByText("HBPR Governance")).toBeInTheDocument();
    expect(screen.getByText("Other notifications")).toBeInTheDocument();
    expect(screen.getByText("Meetings & cadence")).toBeInTheDocument();
    expect(screen.getByText("EPR participation")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Meetings & cadence: in-app notifications" })
    ).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "Meetings & cadence: push notifications" })
    ).not.toBeChecked();
  });

  it("does not show the HBPR heading to a non-HBPR user", async () => {
    vi.mocked(notificationService.getPreferences).mockResolvedValue(preferences);
    render(<NotificationPreferencesSection />);

    expect(await screen.findByText("My leave approved or rejected")).toBeInTheDocument();
    expect(screen.queryByText("HBPR Governance")).not.toBeInTheDocument();
    expect(screen.queryByText("Other notifications")).not.toBeInTheDocument();
  });

  it("shows a retryable error instead of an empty list when loading fails", async () => {
    vi.mocked(notificationService.getPreferences)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(preferences);
    render(<NotificationPreferencesSection />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not load notification preferences/i
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("My leave approved or rejected")).toBeInTheDocument();
  });

  it("explains an empty preference list rather than rendering nothing", async () => {
    vi.mocked(notificationService.getPreferences).mockResolvedValue([]);
    render(<NotificationPreferencesSection />);

    expect(
      await screen.findByText(/no notification preferences are available/i)
    ).toBeInTheDocument();
  });
});
