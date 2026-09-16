import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SkillsLevelSettingsPage } from "./SkillsLevelSettingsPage";
import { skillLevelLabelsService } from "../services/skillsService";
import * as usePluginPermissions from "@/hooks/usePluginPermissions";

vi.mock("@/hooks/usePluginPermissions", () => ({
  usePluginPermissions: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/error-handler", () => ({
  handleApiError: vi.fn(),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const mockLabels = {
  id: 1,
  level_1_label: "Foundational",
  level_2_label: "Developing",
  level_3_label: "Proficient",
  level_4_label: "Advanced",
  level_5_label: "Mastery",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

const renderPage = () => render(<SkillsLevelSettingsPage />, { wrapper });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usePluginPermissions.usePluginPermissions).mockReturnValue({
    canManage: () => false,
    canView: () => true,
    canConfigure: () => true,
    canExport: () => false,
    permissions: [],
    hasPermission: () => false,
    error: null,
    isLoading: false,
  });
  vi.spyOn(skillLevelLabelsService, "get").mockResolvedValue(mockLabels);
  vi.spyOn(skillLevelLabelsService, "update").mockResolvedValue({
    ...mockLabels,
    level_1_label: "Rookie",
  });
});

describe("SkillsLevelSettingsPage", () => {
  it("loads and displays the five current labels", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue("Foundational")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Mastery")).toBeInTheDocument();
    });
  });

  it("saves an edited label", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue("Foundational")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Level 1"), { target: { value: "Rookie" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(skillLevelLabelsService.update).toHaveBeenCalledWith({ level_1_label: "Rookie" });
    });
  });

  it("resets all fields to hardcoded defaults", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue("Foundational")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Level 1"), { target: { value: "Custom" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));

    expect(screen.getByLabelText("Level 1")).toHaveValue("Foundational");
    expect(screen.getByLabelText("Level 5")).toHaveValue("Mastery");
  });

  it("disables inputs and hides actions for users without configure permission", async () => {
    vi.mocked(usePluginPermissions.usePluginPermissions).mockReturnValue({
      canManage: () => false,
      canView: () => true,
      canConfigure: () => false,
      canExport: () => false,
      permissions: [],
      hasPermission: () => false,
      error: null,
      isLoading: false,
    });
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue("Foundational")).toBeInTheDocument());

    expect(screen.getByLabelText("Level 1")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
  });

  it("keeps Save disabled until a field changes", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByDisplayValue("Foundational")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
  });
});
