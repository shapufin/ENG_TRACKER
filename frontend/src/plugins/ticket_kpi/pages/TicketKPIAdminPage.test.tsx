import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TicketKPIAdminPage } from "./TicketKPIAdminPage";

vi.mock("./hooks/useTicketKPIAdmin", () => ({
  useTicketKPIAdmin: () => ({
    activeTab: "profiles",
    setActiveTab: vi.fn(),
    profiles: [],
    clients: [],
    dialogOpen: false,
    setDialogOpen: vi.fn(),
    editingProfile: null,
    testProfileId: null,
    setTestProfileId: vi.fn(),
    testFile: null,
    setTestFile: vi.fn(),
    testResult: null,
    reportYear: 2026,
    setReportYear: vi.fn(),
    createMutation: { isPending: false },
    updateMutation: { isPending: false },
    deleteMutation: { mutate: vi.fn() },
    openCreateDialog: vi.fn(),
    openEditDialog: vi.fn(),
    handleSave: vi.fn(),
    handleTestMapping: vi.fn(),
  }),
}));

describe("TicketKPIAdminPage layout", () => {
  it("uses the full page width like every other admin page (no centred max-w column)", () => {
    render(
      <MemoryRouter>
        <TicketKPIAdminPage />
      </MemoryRouter>
    );
    const tabs = screen.getByRole("tab", { name: /profiles/i });
    const column = tabs.closest("[role=tablist]")!.parentElement!.parentElement as HTMLElement;
    expect(column.className).not.toContain("max-w-5xl");
    expect(column.className).not.toContain("mx-auto");
  });
});
