import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { notificationService, type NotificationTypeConfig } from "../service";
import { NotificationSettingsAdminPage } from "./NotificationSettingsAdminPage";

vi.mock("../service", () => ({
  notificationService: {
    getEventTypeConfig: vi.fn(),
    setEventTypeEnabled: vi.fn(),
  },
}));

// DataTable (TanStack) needs ResizeObserver, which jsdom lacks.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const row = (overrides: Partial<NotificationTypeConfig>): NotificationTypeConfig => ({
  key: "x",
  label: "X",
  description: "",
  audience: "own",
  user_configurable: true,
  event_types: ["x"],
  enabled: true,
  partially_enabled: false,
  ...overrides,
});

const ROWS: NotificationTypeConfig[] = [
  row({ key: "own_leave_submitted", label: "My leave submitted", description: "Sent on submit." }),
  row({
    key: "scorecard_record_shared",
    label: "A 1-on-1 summary was shared with me",
    description: "Sent when shared.",
    user_configurable: false,
  }),
  row({
    key: "team_action_required",
    label: "Team submissions needing action",
    audience: "team",
    enabled: false,
  }),
  row({
    key: "hbpr_meetings",
    label: "Meetings & cadence",
    description: "Meeting recorded, Assignment changed",
    audience: "oversight",
    event_types: ["a", "b"],
  }),
  row({
    key: "hbpr_epr",
    label: "EPR milestones",
    audience: "oversight",
    event_types: ["c", "d"],
    enabled: false,
    partially_enabled: true,
  }),
];

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <NotificationSettingsAdminPage />
    </QueryClientProvider>
  );
  return { invalidate };
};

describe("NotificationSettingsAdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notificationService.getEventTypeConfig).mockResolvedValue(ROWS);
    vi.mocked(notificationService.setEventTypeEnabled).mockImplementation(async (key, enabled) => {
      const current = ROWS.find((r) => r.key === key)!;
      return { ...current, enabled, partially_enabled: false };
    });
  });

  it("renders the three audience groups with their types", async () => {
    renderPage();
    expect(await screen.findByText("Everyone (own requests)")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Team leaders" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "HR business partners" })).toBeInTheDocument();
    expect(screen.getByText("My leave submitted")).toBeInTheDocument();
    expect(screen.getByText("Meetings & cadence")).toBeInTheDocument();
  });

  it("shows the always-delivered badge for types the user cannot configure", async () => {
    renderPage();
    await screen.findByText("A 1-on-1 summary was shared with me");
    expect(
      screen.getAllByText("Always delivered — not shown in user settings").length
    ).toBeGreaterThan(0);
  });

  it("renders a mixed group as Partially on", async () => {
    renderPage();
    await screen.findByText("EPR milestones");
    expect(screen.getByText("Partially on")).toBeInTheDocument();
  });

  it("turning a type on applies immediately without a confirm", async () => {
    renderPage();
    const toggle = await screen.findByRole("switch", {
      name: "Enable Team submissions needing action",
    });
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(notificationService.setEventTypeEnabled).toHaveBeenCalledWith(
        "team_action_required",
        true
      )
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("turning a type off asks first, then PATCHes enabled:false and invalidates the admin key", async () => {
    const { invalidate } = renderPage();
    const toggle = await screen.findByRole("switch", { name: "Enable Meetings & cadence" });
    fireEvent.click(toggle);

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText('Disable "Meetings & cadence" for everyone?')
    ).toBeInTheDocument();
    expect(notificationService.setEventTypeEnabled).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Disable for everyone" }));

    await waitFor(() =>
      expect(notificationService.setEventTypeEnabled).toHaveBeenCalledWith("hbpr_meetings", false)
    );
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["admin", "notification-config"] })
      )
    );
  });
});
