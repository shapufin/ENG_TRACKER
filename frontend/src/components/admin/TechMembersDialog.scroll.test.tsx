import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TechMembersDialog } from "./TechMembersDialog";

vi.mock("@/services/userService", () => ({
  userService: {
    getTechMembers: vi.fn(),
    getUsers: vi.fn(),
    addTechMembers: vi.fn(),
    removeTechMembers: vi.fn(),
  },
}));

import { userService } from "@/services/userService";

const mockService = userService as unknown as {
  getTechMembers: ReturnType<typeof vi.fn>;
  getUsers: ReturnType<typeof vi.fn>;
};

const tech = { id: 7, name: "SIAE" } as any;

const renderModal = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TechMembersDialog tech={tech} open onOpenChange={() => {}} />
    </QueryClientProvider>
  );
};

// Scroll contract: the outer dialog is viewport-guarded; the two panels use
// viewport-relative caps so the header never scrolls off on short screens.
describe("TechMembersDialog scroll contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockService.getTechMembers.mockResolvedValue({ results: [] });
    mockService.getUsers.mockResolvedValue({ results: [], count: 0 });
  });

  it("dialog is a bounded flex column with a scrollable body region", async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText("Members (0)")).toBeInTheDocument();
    });
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("flex-col");
    expect(dlg.className).toContain("overflow-hidden");
    expect(dlg.className).not.toContain("overflow-y-auto");
    expect(document.querySelectorAll(".flex-1.overflow-y-auto").length).toBeGreaterThan(0);
  });

  it("panel caps are viewport-relative, never fixed px", async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText("Members (0)")).toBeInTheDocument();
    });
    const html = document.querySelector("[role='dialog']")!.innerHTML;
    expect(html).not.toContain("max-h-[400px]");
    expect(html).not.toContain("max-h-[360px]");
  });
});
