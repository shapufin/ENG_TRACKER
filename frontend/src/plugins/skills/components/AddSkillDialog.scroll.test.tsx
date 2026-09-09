import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AddSkillDialog } from "./AddSkillDialog";

vi.mock("../hooks/useSkillsQueries", () => ({
  useSkillCategories: () => ({ data: [] }),
  useSkills: () => ({ data: [], isLoading: false, error: null }),
}));

const renderDialog = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AddSkillDialog open onClose={vi.fn()} onAdd={vi.fn()} />
    </QueryClientProvider>
  );
};

// Scroll contract: header + footer stay pinned while the picker grid scrolls
// (desktop primitive is overflow-visible, so the dialog must guard itself).
describe("AddSkillDialog scroll contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dialog is a bounded flex column with a scrollable body and sticky footer", async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText("Add skills to your profile")).toBeInTheDocument();
    });
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("flex-col");
    expect(dlg.className).toContain("overflow-hidden");
    expect(dlg.className).toContain("max-h-[90vh]");
    expect(dlg.className).not.toContain("overflow-y-auto");
    expect(document.querySelectorAll(".flex-1.overflow-y-auto").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".shrink-0").length).toBeGreaterThan(0);
    const body = document.querySelector(".flex-1.overflow-y-auto") as HTMLElement;
    expect(body.className).toContain("no-scrollbar");
  });
});
