import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { notificationService } from "../service";
import { NotificationSettingsAdminPage } from "./NotificationSettingsAdminPage";
import { MOBILE_CARD_QUERY } from "@/components/ui/DataTableCards";

vi.mock("../service", () => ({
  notificationService: { getEventTypeConfig: vi.fn(), setEventTypeEnabled: vi.fn() },
}));

describe("NotificationSettingsAdminPage phone cards", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows each notification type as a card with its switch", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === MOBILE_CARD_QUERY,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    vi.mocked(notificationService.getEventTypeConfig).mockResolvedValue([
      {
        key: "own_leave_submitted",
        label: "My leave submitted",
        description: "Sent on submit.",
        audience: "own",
        user_configurable: true,
        event_types: ["x"],
        enabled: true,
        partially_enabled: false,
      },
    ]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NotificationSettingsAdminPage />
      </QueryClientProvider>
    );

    const card = await screen.findByRole("listitem");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(within(card).getByText("My leave submitted")).toBeInTheDocument();
    expect(within(card).getByRole("switch", { name: "Enable My leave submitted" })).toBeChecked();
    expect(within(card).getByText("Configurable")).toBeInTheDocument();
  });
});
