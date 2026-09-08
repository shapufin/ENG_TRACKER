import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrganigramaAdminPage } from "../pages/OrganigramaAdminPage";

vi.mock("../hooks/useOrganigramaAdmin", () => ({
  useOrganigramaCharts: () => ({ data: [], isLoading: false, isError: false }),
  useCreateChart: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteChart: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateChart: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => ({ isAdmin: true, isSuperuser: false }),
}));

describe("OrganigramaAdminPage modernization", () => {
  it("places chart filters inside a non-hover-lift GlassCard", () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <OrganigramaAdminPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const search = screen.getByPlaceholderText("Search by name, slug, or description...");
    expect(search.closest("[class*='shadow-glass']")?.className).toContain("p-4");
    expect(search.closest("[class*='shadow-glass']")?.className).not.toContain(
      "hover:-translate-y-1"
    );
    expect(container).toBeTruthy();
  });
});
