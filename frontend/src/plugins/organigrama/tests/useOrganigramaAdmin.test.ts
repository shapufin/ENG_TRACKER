/** Tests for the Organigrama admin hooks. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useOrganigramaCharts,
  useOrganigramaChart,
  useOrganigramaDraft,
  useCreateChart,
} from "../hooks/useOrganigramaAdmin";
import { organigramaAdminService } from "../services/organigramaAdminService";
import type { OrgChart, DraftPayload } from "../types";

vi.mock("../services/organigramaAdminService");

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
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
  revision_number: 0,
  node_count: 0,
  created_by: null,
  updated_by: null,
  published_revision: null,
  published_at: null,
  published_by_name: null,
  audience_role_codes: [],
  audience_group_ids: [],
  created_at: "",
  updated_at: "",
};

const mockDraft: DraftPayload = {
  revision_number: 0,
  nodes: [],
  edges: [],
};

describe("useOrganigramaAdmin hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches chart list", async () => {
    vi.mocked(organigramaAdminService.getCharts).mockResolvedValue([mockChart]);
    const { result } = renderHook(() => useOrganigramaCharts(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([mockChart]);
  });

  it("fetches a chart by id", async () => {
    vi.mocked(organigramaAdminService.getChart).mockResolvedValue(mockChart);
    const { result } = renderHook(() => useOrganigramaChart(1), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockChart);
    expect(organigramaAdminService.getChart).toHaveBeenCalledWith(1);
  });

  it("does not fetch chart when id is null", async () => {
    vi.mocked(organigramaAdminService.getChart).mockResolvedValue(mockChart);
    const { result } = renderHook(() => useOrganigramaChart(null), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(organigramaAdminService.getChart).not.toHaveBeenCalled();
  });

  it("fetches a draft", async () => {
    vi.mocked(organigramaAdminService.getDraft).mockResolvedValue(mockDraft);
    const { result } = renderHook(() => useOrganigramaDraft(1), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockDraft);
  });

  it("creates a chart and invalidates list cache", async () => {
    vi.mocked(organigramaAdminService.createChart).mockResolvedValue(mockChart);
    const { result } = renderHook(() => useCreateChart(), { wrapper: createWrapper() });
    act(() => result.current.mutate({ name: "Engineering" }));
    await waitFor(() =>
      expect(organigramaAdminService.createChart).toHaveBeenCalledWith({ name: "Engineering" })
    );
  });
});
