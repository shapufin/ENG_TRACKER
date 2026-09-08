/** Tests for OrganigramaPage component. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { OrganigramaPage } from "../pages/OrganigramaPage";
import { organigramaService } from "../services/organigramaService";
import type { OrgTreeResponse, OrgChart, DraftPayload } from "../types";

vi.mock("../services/organigramaService");
vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: vi.fn(() => false),
}));
vi.mock("../components/OrgChartPage", () => ({
  OrgChartPage: () => React.createElement("div", { "data-testid": "org-chart-desktop" }),
}));
vi.mock("../components/CustomChartViewer", () => ({
  CustomChartViewer: (_props: { chart: OrgChart; payload: DraftPayload }) =>
    React.createElement("div", { "data-testid": "custom-chart-viewer" }),
}));

const mockTree: OrgTreeResponse = {
  roots: [
    {
      type: "person",
      id: 1,
      username: "it_tl",
      full_name: "Andrea Negro",
      role_badge: "italian_tl",
      children: [
        {
          type: "person",
          id: 2,
          username: "al_tl",
          full_name: "Enri Demnushi",
          role_badge: "albanian_tl",
          children: [
            {
              type: "tech",
              id: 10,
              name: "Infrastructure",
              code: "INFRA",
              children: [
                {
                  type: "person",
                  id: 20,
                  username: "emp1",
                  full_name: "Aldair Xhelili",
                  role_badge: "employee",
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  scope: "full",
  total_nodes: 4,
};

const mockVisibleChart = {
  id: 1,
  name: "Custom Org",
  slug: "custom",
} as unknown as OrgChart;

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(MemoryRouter, null, React.createElement(OrganigramaPage))
    )
  );
}

describe("OrganigramaPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(organigramaService.getVisibleCharts).mockResolvedValue([]);
    vi.mocked(organigramaService.getPublishedChart).mockResolvedValue({
      revision_number: 1,
      nodes: [],
      edges: [],
    } as unknown as DraftPayload);
  });

  it("shows loading state initially", () => {
    vi.mocked(organigramaService.getTree).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows error state on fetch failure", async () => {
    vi.mocked(organigramaService.getTree).mockRejectedValue(new Error("Network"));
    renderPage();
    expect(await screen.findByText("Failed to load organizational chart.")).toBeInTheDocument();
  });

  it("shows empty state when no data", async () => {
    vi.mocked(organigramaService.getTree).mockResolvedValue({
      roots: [],
      scope: "chain",
      total_nodes: 0,
    });
    renderPage();
    expect(await screen.findByText("No organizational data available.")).toBeInTheDocument();
  });

  it("renders chart with data", async () => {
    vi.mocked(organigramaService.getTree).mockResolvedValue(mockTree);
    renderPage();
    expect(await screen.findByText("Organigrama")).toBeInTheDocument();
    expect(screen.getByText(/4 nodes/)).toBeInTheDocument();
  });

  it("shows scope indicator", async () => {
    vi.mocked(organigramaService.getTree).mockResolvedValue(mockTree);
    renderPage();
    expect(await screen.findByText(/scope:\s*full/)).toBeInTheDocument();
  });

  it("renders source selector when live tree and published custom charts are available", async () => {
    vi.mocked(organigramaService.getTree).mockResolvedValue(mockTree);
    vi.mocked(organigramaService.getVisibleCharts).mockResolvedValue([mockVisibleChart]);
    renderPage();
    const combobox = await screen.findByRole("combobox", { name: /Select chart source/i });
    expect(combobox).toBeInTheDocument();
    expect(combobox).toHaveTextContent("Live company chart");
  });

  it("uses the mockup page-header treatment (font-black title, bottom border)", async () => {
    vi.mocked(organigramaService.getTree).mockResolvedValue(mockTree);
    renderPage();
    const title = await screen.findByRole("heading", { level: 1, name: "Organigrama" });
    expect(title.className).toContain("font-black");
    expect(title.className).toContain("tracking-tight");
    const headerRow = title.closest(".border-b");
    expect(headerRow).toBeTruthy();
    expect(headerRow?.className).toContain("pb-3");
    expect(headerRow?.className).toContain("border-line-subtle");
  });
});
