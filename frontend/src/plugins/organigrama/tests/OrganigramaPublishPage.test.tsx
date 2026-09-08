/** Tests for the OrganigramaPublishPage component. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Mock the admin service — all hooks call through to this.
vi.mock("../services/organigramaAdminService", () => ({
  organigramaAdminService: {
    getChart: vi.fn(),
    getDraft: vi.fn(),
    getAudienceRoles: vi.fn(),
    getAudienceGroups: vi.fn(),
    getRevisions: vi.fn(),
    updateChart: vi.fn(),
    publishChart: vi.fn(),
    unpublishChart: vi.fn(),
    validateDraft: vi.fn(),
  },
}));

// Mock useMediaQuery is not needed here; the publish page doesn't use it.
vi.mock("@/components/layout/PageShell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
}));

const usePermissionMock = vi.hoisted(() => vi.fn());
vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => usePermissionMock(),
}));

vi.mock("@/components/ui/GlassCard", () => ({
  GlassCard: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "glass-card" }, children),
}));

import { organigramaAdminService } from "../services/organigramaAdminService";
import { OrganigramaPublishPage } from "../pages/OrganigramaPublishPage";
import type { OrgChart, DraftPayload, OrgChartRevision } from "../types";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      MemoryRouter,
      { initialEntries: ["/admin/organigrama/1/publish"] },
      React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, {
            path: "/admin/organigrama/:chartId/publish",
            element: children,
          })
        )
      )
    );
}

const mockChart: OrgChart = {
  id: 1,
  name: "Engineering",
  slug: "engineering",
  description: "",
  source_mode: "custom",
  status: "draft",
  audience_mode: "private_admin",
  is_featured: false,
  revision_number: 1,
  node_count: 2,
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
};

const mockDraft: DraftPayload = {
  revision_number: 1,
  nodes: [],
  edges: [],
};

const mockRevisions: { count: number; results: OrgChartRevision[] } = {
  count: 1,
  results: [
    {
      id: 10,
      version: 1,
      checksum: "abc123",
      change_summary: "Initial publish",
      schema_version: 1,
      published_by: 1,
      published_by_name: "Admin",
      published_at: "2026-08-17T12:00:00Z",
    },
  ],
};

function setupMocks(overrides?: { chart?: Partial<OrgChart> }) {
  vi.mocked(organigramaAdminService.getChart).mockResolvedValue({
    ...mockChart,
    ...overrides?.chart,
  });
  vi.mocked(organigramaAdminService.getDraft).mockResolvedValue(mockDraft);
  vi.mocked(organigramaAdminService.getAudienceRoles).mockResolvedValue([]);
  vi.mocked(organigramaAdminService.getAudienceGroups).mockResolvedValue({
    count: 0,
    results: [],
  });
  vi.mocked(organigramaAdminService.getRevisions).mockResolvedValue(mockRevisions);
}

describe("OrganigramaPublishPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePermissionMock.mockReturnValue({ isAdmin: true, isSuperuser: false });
  });

  it("renders the chart name and audience mode from server data", async () => {
    setupMocks({ chart: { audience_mode: "all_authenticated" } });
    render(<OrganigramaPublishPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("All authenticated users")).toBeInTheDocument();
    });
  });

  it("renders revision history when revisions exist", async () => {
    setupMocks();
    render(<OrganigramaPublishPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Revision history")).toBeInTheDocument();
    });
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("Initial publish")).toBeInTheDocument();
  });

  it("does not render revision history when there are no revisions", async () => {
    setupMocks();
    vi.mocked(organigramaAdminService.getRevisions).mockResolvedValue({
      count: 0,
      results: [],
    });
    render(<OrganigramaPublishPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Audience")).toBeInTheDocument();
    });
    expect(screen.queryByText("Revision history")).not.toBeInTheDocument();
  });

  it("shows pagination controls when audience groups span multiple pages", async () => {
    setupMocks({ chart: { audience_mode: "selected" } });
    vi.mocked(organigramaAdminService.getAudienceGroups).mockResolvedValue({
      count: 101,
      results: [{ id: 1, name: "Engineering", code: "eng" }],
    });
    render(<OrganigramaPublishPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Next group page" })).toBeInTheDocument();
    });
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
  });

  it("disables publishing when the draft has no nodes", async () => {
    setupMocks();
    render(<OrganigramaPublishPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Publish now" })).toBeDisabled();
    });
  });

  // The audience summary appeared in BOTH cards (dangling under the left
  // card's Save button + the right preview callout). Keep only the right one.
  it("renders the audience summary exactly once", async () => {
    setupMocks();
    render(<OrganigramaPublishPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getAllByText("Who gets access?")).toHaveLength(1);
    });
  });

  // The chart name rendered as a bare subtitle string ("test") — style it as
  // a labeled mono pill instead.
  it("renders the chart name as a labeled target-chart pill", async () => {
    setupMocks();
    render(<OrganigramaPublishPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Target chart:")).toBeInTheDocument();
    });
    const pill = screen.getByText("Engineering");
    expect(pill.className).toContain("font-mono");
  });
});
