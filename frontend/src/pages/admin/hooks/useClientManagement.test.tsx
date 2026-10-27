import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useClientManagement } from "./useClientManagement";
import { overtimeService } from "@/services/overtimeService";
import { toast } from "sonner";

vi.mock("@/services/overtimeService", () => ({
  overtimeService: {
    getClients: vi.fn().mockResolvedValue([]),
    createClient: vi.fn(),
    updateClient: vi.fn(),
    archiveClient: vi.fn(),
    unarchiveClient: vi.fn(),
    deleteClient: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe("useClientManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("surfaces structured 409 blockers in error toast when delete fails with kept records", async () => {
    const blockers = [
      "Client still has records that must be kept: overtime_logs (3).",
      "Client still has onboarding data to purge first: onboarding_folders (1).",
    ];
    const conflictError = {
      response: {
        status: 409,
        data: {
          detail: "This client cannot be deleted. Archive it instead.",
          blockers,
        },
      },
    };

    vi.mocked(overtimeService.deleteClient).mockRejectedValueOnce(conflictError);

    const { result } = renderHook(() => useClientManagement(), { wrapper });

    await act(async () => {
      result.current.deleteMutation.mutate(5);
    });

    expect(toast.error).toHaveBeenCalledWith("Cannot delete client", {
      description: blockers.join(" "),
      duration: 7000,
    });
  });
});
