/** Tests for useOrganigramaQueries hook. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  useOrganigramaTree,
  useOrganigramaSubtree,
  useOrganigramaVisibleCharts,
  useOrganigramaPublished,
} from "../hooks/useOrganigramaQueries";
import { organigramaService } from "../services/organigramaService";
import type { OrgTreeResponse, OrgChart, DraftPayload } from "../types";

vi.mock("../services/organigramaService");

const mockTree: OrgTreeResponse = {
  roots: [
    {
      type: "person",
      id: 1,
      username: "it_tl",
      full_name: "Italian TL",
      role_badge: "italian_tl",
      children: [],
    },
  ],
  scope: "full",
  total_nodes: 1,
};

const mockVisibleCharts: OrgChart[] = [
  {
    id: 1,
    name: "Q3 Structure",
    slug: "q3-structure",
    status: "published",
    source_mode: "custom",
    node_count: 5,
    revision_number: 1,
    is_featured: false,
    description: "",
    audience_mode: "all_authenticated",
    audience_role_codes: [],
    audience_group_ids: [],
    published_revision: 1,
    published_at: "2026-08-17T00:00:00Z",
    published_by_name: "Admin",
    created_by: 1,
    created_by_name: "Admin",
    updated_by: 1,
    updated_by_name: "Admin",
    created_at: "2026-08-17T00:00:00Z",
    updated_at: "2026-08-17T00:00:00Z",
  },
];

const mockPayload: DraftPayload = {
  revision_number: 1,
  nodes: [
    {
      node_uuid: "n1",
      shape_type: "person",
      display_name: "CEO",
      position_x: 0,
      position_y: 0,
      width: 180,
      height: 80,
      sort_order: 0,
      status: "active",
    },
  ],
  edges: [],
};

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useOrganigramaTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and returns tree data", async () => {
    vi.mocked(organigramaService.getTree).mockResolvedValue(mockTree);
    const { result } = renderHook(() => useOrganigramaTree(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockTree);
  });

  it("returns error on fetch failure", async () => {
    vi.mocked(organigramaService.getTree).mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useOrganigramaTree(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

describe("useOrganigramaSubtree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch when nodeId is null", async () => {
    vi.mocked(organigramaService.getSubtree).mockResolvedValue({ children: [] });
    const { result } = renderHook(() => useOrganigramaSubtree(null, "person", true), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(organigramaService.getSubtree).not.toHaveBeenCalled();
  });

  it("does not fetch when enabled is false", async () => {
    vi.mocked(organigramaService.getSubtree).mockResolvedValue({ children: [] });
    const { result } = renderHook(() => useOrganigramaSubtree(5, "tech", false), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(organigramaService.getSubtree).not.toHaveBeenCalled();
  });

  it("fetches subtree when nodeId and nodeType are provided and enabled", async () => {
    vi.mocked(organigramaService.getSubtree).mockResolvedValue({
      children: [
        {
          type: "person",
          id: 10,
          username: "emp1",
          full_name: "Emp One",
          role_badge: "employee",
          children: [],
        },
      ],
    });
    const { result } = renderHook(() => useOrganigramaSubtree(5, "person", true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(organigramaService.getSubtree).toHaveBeenCalledWith(5, "person");
    expect(result.current.data?.children).toHaveLength(1);
  });
});

describe("useOrganigramaVisibleCharts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and returns visible published charts", async () => {
    vi.mocked(organigramaService.getVisibleCharts).mockResolvedValue(mockVisibleCharts);
    const { result } = renderHook(() => useOrganigramaVisibleCharts(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(organigramaService.getVisibleCharts).toHaveBeenCalled();
    expect(result.current.data).toEqual(mockVisibleCharts);
  });

  it("returns error on fetch failure", async () => {
    vi.mocked(organigramaService.getVisibleCharts).mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useOrganigramaVisibleCharts(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

describe("useOrganigramaPublished", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch when chartId is null", async () => {
    vi.mocked(organigramaService.getPublishedChart).mockResolvedValue(mockPayload);
    const { result } = renderHook(() => useOrganigramaPublished(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(organigramaService.getPublishedChart).not.toHaveBeenCalled();
  });

  it("fetches the published payload for a given chartId", async () => {
    vi.mocked(organigramaService.getPublishedChart).mockResolvedValue(mockPayload);
    const { result } = renderHook(() => useOrganigramaPublished(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(organigramaService.getPublishedChart).toHaveBeenCalledWith(1);
    expect(result.current.data).toEqual(mockPayload);
  });
});
