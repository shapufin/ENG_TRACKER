import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TicketKPIEvidenceSection } from "./TicketKPIEvidenceSection";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));

vi.mock("../../pages/hooks/useTicketKPIEvidence", () => ({
  useTicketKPIEvidence: () => ({
    evidence: [],
    isLoading: false,
    canReview: false,
    availableClients: [],
    isUploadOpen: true,
    setIsUploadOpen: vi.fn(),
    selectedType: "document",
    setSelectedType: vi.fn(),
    description: "",
    setDescription: vi.fn(),
    file: null,
    setFile: vi.fn(),
    selectedClientIds: [],
    handleClientToggle: vi.fn(),
    createMutation: { mutate: vi.fn(), isPending: false },
    deleteMutation: { mutate: vi.fn(), isPending: false },
    reviewMutation: { mutate: vi.fn(), isPending: false },
    unreviewMutation: { mutate: vi.fn(), isPending: false },
  }),
}));

vi.mock("./EvidenceList", () => ({ EvidenceList: () => <div data-testid="evidence-list" /> }));
vi.mock("./EvidenceUploadForm", () => ({
  EvidenceUploadForm: () => <div data-testid="evidence-upload-form" />,
}));

const renderSection = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TicketKPIEvidenceSection month="2026-09" />
    </QueryClientProvider>
  );
};

// Scroll contract: the tall upload form is height-guarded so it can never
// clip the viewport on desktop.
describe("TicketKPIEvidenceSection upload dialog scroll contract", () => {
  it("upload dialog is a bounded flex column with a scrollable body", () => {
    // NOTE: the hook mock reports isUploadOpen: true so the dialog renders
    // open without driving the Add-Evidence button through the real hook.
    renderSection();
    expect(screen.getByText("Upload KPI Evidence")).toBeInTheDocument();
    const dlg = document.querySelector("[role='dialog']") as HTMLElement | null;
    expect(dlg).not.toBeNull();
    expect(dlg!.className).toContain("flex-col");
    expect(dlg!.className).toContain("overflow-hidden");
    expect(dlg!.className).toMatch(/max-h-/);
    expect(dlg!.className).not.toContain("overflow-y-auto");
    expect(document.querySelectorAll(".flex-1.overflow-y-auto").length).toBeGreaterThan(0);
  });
});
