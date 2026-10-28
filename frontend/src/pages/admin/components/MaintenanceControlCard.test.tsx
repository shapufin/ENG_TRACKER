import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { MaintenanceStatus } from "@/types";

const state = vi.hoisted(() => ({
  data: undefined as MaintenanceStatus | undefined,
}));

vi.mock("@/hooks/useMaintenanceStatus", () => ({
  MAINTENANCE_STATUS_QUERY_KEY: ["maintenance-status"],
  useMaintenanceStatus: () => ({ data: state.data, isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock("@/services/maintenanceService", () => ({
  maintenanceService: { update: vi.fn() },
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, "ResizeObserver", { value: ResizeObserverMock, writable: true });

import { maintenanceService } from "@/services/maintenanceService";
import { MaintenanceControlCard } from "./MaintenanceControlCard";

const base: MaintenanceStatus = {
  active: false,
  title: "Scheduled maintenance",
  message: "We are updating the platform.",
  started_at: null,
  ends_at: null,
  updated_at: "2026-10-27T20:00:00Z",
  site_name: "Engineering Tracker",
  logo_url: null,
};

const renderCard = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MaintenanceControlCard />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  state.data = { ...base };
  vi.mocked(maintenanceService.update).mockReset();
  vi.mocked(maintenanceService.update).mockResolvedValue({ ...base, active: true } as never);
});

describe("MaintenanceControlCard", () => {
  it("shows the switch off and the editable copy", () => {
    renderCard();

    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.getByLabelText("Put the site into maintenance mode")).not.toBeChecked();
    expect(screen.getByLabelText("Headline")).toHaveValue("Scheduled maintenance");
    expect(screen.getByLabelText("Message")).toHaveValue("We are updating the platform.");
  });

  it("asks for confirmation, then activates with the draft copy", async () => {
    renderCard();

    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Upgrade window" } });
    fireEvent.click(screen.getByLabelText("Put the site into maintenance mode"));

    expect(maintenanceService.update).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Start maintenance" }));

    await waitFor(() =>
      expect(maintenanceService.update).toHaveBeenCalledWith({
        is_active: true,
        title: "Upgrade window",
        message: "We are updating the platform.",
        ends_at: null,
      })
    );
  });

  it("saves the message of an already-active window without toggling it", async () => {
    state.data = { ...base, active: true, started_at: "2026-10-27T20:00:00Z" };
    renderCard();

    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Almost done." } });
    fireEvent.click(screen.getByRole("button", { name: "Save message" }));

    await waitFor(() =>
      expect(maintenanceService.update).toHaveBeenCalledWith({
        title: "Scheduled maintenance",
        message: "Almost done.",
        ends_at: null,
      })
    );
  });

  it("refuses an expected end in the past", () => {
    renderCard();

    fireEvent.change(screen.getByLabelText("Expected end (optional)"), {
      target: { value: "2020-01-01T10:00" },
    });

    expect(screen.getByText("The expected end must be in the future.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save message" })).toBeDisabled();
  });

  it("blocks saving while the headline is empty", () => {
    state.data = { ...base, active: true };
    renderCard();

    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "   " } });

    expect(screen.getByRole("button", { name: "Save message" })).toBeDisabled();
  });

  it("previews the draft maintenance screen", async () => {
    renderCard();

    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Draft headline" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(await screen.findByText("Maintenance screen preview")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Draft headline" })).toBeInTheDocument();
  });
});
