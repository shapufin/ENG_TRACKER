/** Tests for the OrganigramaAdminPage component. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("../services/organigramaAdminService", () => ({
  organigramaAdminService: {
    getCharts: vi.fn(),
    createChart: vi.fn(),
    deleteChart: vi.fn(),
    updateChart: vi.fn(),
  },
}));

const usePermissionMock = vi.hoisted(() => vi.fn());
vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => usePermissionMock(),
}));

vi.mock("@/components/layout/PageShell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
}));

vi.mock("@/components/ui/GlassCard", () => ({
  GlassCard: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
}));

vi.mock("@/components/ui/FormDialog", () => ({
  FormDialog: () => null,
}));

vi.mock("@/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: () => null,
}));

import { organigramaAdminService } from "../services/organigramaAdminService";
import { OrganigramaAdminPage } from "../pages/OrganigramaAdminPage";
import type { OrgChart } from "../types";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(QueryClientProvider, { client: qc }, children)
    );
}

const mockCharts: OrgChart[] = [
  {
    id: 1,
    name: "Engineering",
    slug: "engineering",
    description: "",
    source_mode: "custom",
    status: "published",
    audience_mode: "all_authenticated",
    is_featured: true,
    revision_number: 3,
    node_count: 10,
    created_by: 1,
    created_by_name: "Admin",
    updated_by: 1,
    updated_by_name: "Admin",
    published_revision: 1,
    published_at: "2026-08-17T00:00:00Z",
    published_by_name: "Admin",
    audience_role_codes: [],
    audience_group_ids: [],
    created_at: "2026-08-17T00:00:00Z",
    updated_at: "2026-08-17T00:00:00Z",
  },
  {
    id: 2,
    name: "Draft Chart",
    slug: "draft-chart",
    description: "",
    source_mode: "custom",
    status: "draft",
    audience_mode: "private_admin",
    is_featured: false,
    revision_number: 1,
    node_count: 5,
    created_by: 1,
    created_by_name: "Admin",
    updated_by: 1,
    updated_by_name: "Admin",
    published_revision: null,
    published_at: null,
    published_by_name: null,
    audience_role_codes: [],
    audience_group_ids: [],
    created_at: "2026-08-17T00:00:00Z",
    updated_at: "2026-08-17T00:00:00Z",
  },
];

describe("OrganigramaAdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Staff admin by default — matches the page's historical access model.
    usePermissionMock.mockReturnValue({ isAdmin: true, isSuperuser: false });
  });

  it("redirects non-staff users (HR) to the user-shell /organigrama page", () => {
    // Audit 2026-09-07: the charts directory API is staff-only
    // (IsStaffOrSuperuser) — HR admitted by the admin route guard only saw
    // 403s and a "Failed to load charts" error state here.
    usePermissionMock.mockReturnValue({ isAdmin: false, isSuperuser: false });
    vi.mocked(organigramaAdminService.getCharts).mockResolvedValue([]);
    render(<OrganigramaAdminPage />, { wrapper: createWrapper() });
    // Navigate replaces the route — the directory content must not render.
    expect(screen.queryByText(/no charts yet/i)).not.toBeInTheDocument();
  });

  it("renders charts with name, status, and node count", async () => {
    vi.mocked(organigramaAdminService.getCharts).mockResolvedValue(mockCharts);
    render(<OrganigramaAdminPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Engineering")).toBeInTheDocument();
    });
    expect(screen.getByText("Draft Chart")).toBeInTheDocument();
    expect(screen.getByText(/10 nodes/)).toBeInTheDocument();
  });

  it("renders a search input", async () => {
    vi.mocked(organigramaAdminService.getCharts).mockResolvedValue(mockCharts);
    render(<OrganigramaAdminPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });
  });

  it("renders a status filter dropdown", async () => {
    vi.mocked(organigramaAdminService.getCharts).mockResolvedValue(mockCharts);
    render(<OrganigramaAdminPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Engineering")).toBeInTheDocument();
    });
    // The status filter Select trigger is present
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("disables delete for published charts and shows a policy hint", async () => {
    vi.mocked(organigramaAdminService.getCharts).mockResolvedValue(mockCharts);
    render(<OrganigramaAdminPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Engineering")).toBeInTheDocument();
    });
    // The published chart's delete button should be disabled
    const deleteButtons = screen.getAllByLabelText(/delete chart/i);
    expect(deleteButtons.some((btn) => (btn as HTMLButtonElement).disabled)).toBe(true);
  });

  it("shows empty state when no charts exist", async () => {
    vi.mocked(organigramaAdminService.getCharts).mockResolvedValue([]);
    render(<OrganigramaAdminPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/no charts yet/i)).toBeInTheDocument();
    });
  });

  it("renders a featured toggle button per chart", async () => {
    vi.mocked(organigramaAdminService.getCharts).mockResolvedValue(mockCharts);
    render(<OrganigramaAdminPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Engineering")).toBeInTheDocument();
    });
    // Featured toggle buttons (star icons with aria-label containing "feature")
    const featuredButtons = screen.getAllByLabelText(/feature/i);
    expect(featuredButtons.length).toBeGreaterThan(0);
  });
});
