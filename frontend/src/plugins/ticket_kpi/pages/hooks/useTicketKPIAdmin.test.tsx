import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTicketKPIAdmin } from "./useTicketKPIAdmin";
import { ticketKPIService } from "../../services/ticketKPIService";
import type { ExportProfile } from "../../types/ticketKPI";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/services/overtimeService", () => ({
  overtimeService: { getClients: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../services/ticketKPIService", () => ({
  ticketKPIService: {
    getProfiles: vi.fn().mockResolvedValue([]),
    getProfile: vi.fn(),
  },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe("useTicketKPIAdmin openEditDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("edits the full profile, not the lightweight list row", async () => {
    const listRow = { id: 1, name: "ServiceNow" } as ExportProfile;
    const full = {
      ...listRow,
      field_mapping: { ticket_id: "Number" },
      compute_sla: true,
    } as ExportProfile;
    vi.mocked(ticketKPIService.getProfile).mockResolvedValue({ data: full } as never);

    const { result } = renderHook(() => useTicketKPIAdmin(), { wrapper });
    await act(async () => {
      await result.current.openEditDialog(listRow);
    });

    await waitFor(() => expect(result.current.dialogOpen).toBe(true));
    expect(ticketKPIService.getProfile).toHaveBeenCalledWith(1);
    expect(result.current.editingProfile).toEqual(full);
  });

  it("does not open the dialog when the profile cannot be loaded", async () => {
    vi.mocked(ticketKPIService.getProfile).mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useTicketKPIAdmin(), { wrapper });
    await act(async () => {
      await result.current.openEditDialog({ id: 1 } as ExportProfile);
    });

    expect(result.current.dialogOpen).toBe(false);
  });
});
