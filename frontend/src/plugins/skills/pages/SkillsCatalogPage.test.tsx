import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SkillsCatalogPage } from "./SkillsCatalogPage";
import type { Skill, SkillCategory } from "../types/skills";

// PluginImportButton (admin page headers) reads the active-plugin list. With
// data_import inactive it renders nothing — the same graceful path taken when
// the plugin is disabled or removed.
vi.mock("@/context/PluginContext", () => ({
  usePlugins: () => ({ activePlugins: [], isLoading: false }),
}));

const mutation = () => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
});
const mocks = vi.hoisted(() => ({
  useSkillCategories: vi.fn(),
  useSkills: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  createSkill: vi.fn(),
  updateSkill: vi.fn(),
}));
const updateSkillMutation = mutation();

vi.mock("@/components/layout/PageShell", () => ({
  PageShell: ({
    children,
    title,
    actions,
  }: {
    children: React.ReactNode;
    title: string;
    actions?: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      {actions}
      {children}
    </div>
  ),
}));
vi.mock("../hooks/useSkillsQueries", () => ({
  useSkillCategories: () => mocks.useSkillCategories(),
  useSkills: () => mocks.useSkills(),
  useCreateSkillCategory: () => mocks.createCategory(),
  useUpdateSkillCategory: () => mocks.updateCategory(),
  useDeleteSkillCategory: () => mocks.deleteCategory(),
  useCreateSkill: () => mocks.createSkill(),
  useUpdateSkill: () => mocks.updateSkill(),
}));

vi.mock("../services/skillsService", () => ({
  skillService: {
    create: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
  },
  skillCategoryService: {
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
  },
}));

const categories: SkillCategory[] = [
  {
    id: 1,
    name: "Infrastructure",
    code: "infra",
    description: "Systems",
    is_active: true,
    skill_count: 2,
    created_at: "",
    updated_at: "",
  },
];
const skills: Skill[] = [
  {
    id: 10,
    category: 1,
    category_name: "Infrastructure",
    category_code: "infra",
    name: "Linux",
    code: "linux",
    description: "",
    is_active: true,
    created_at: "",
    updated_at: "",
  },
  {
    id: 11,
    category: 1,
    category_name: "Infrastructure",
    category_code: "infra",
    name: "Microsoft",
    code: "microsoft",
    description: "",
    is_active: false,
    created_at: "",
    updated_at: "",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useSkillCategories.mockReturnValue({
    data: categories,
    isLoading: false,
    refetch: vi.fn(),
  });
  mocks.useSkills.mockReturnValue({ data: skills, isLoading: false, refetch: vi.fn() });
  mocks.createCategory.mockReturnValue(mutation());
  mocks.updateCategory.mockReturnValue(mutation());
  mocks.deleteCategory.mockReturnValue(mutation());
  mocks.createSkill.mockReturnValue(mutation());
  mocks.updateSkill.mockReturnValue(updateSkillMutation);
});

const renderPage = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SkillsCatalogPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("SkillsCatalogPage", () => {
  it("renders categories and a structured skill table", () => {
    renderPage();
    expect(screen.getByText("Skills Catalog")).toBeInTheDocument();
    // "Categories" appears in the sidebar header and the stats card.
    expect(screen.getAllByText("Categories").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Linux").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Microsoft").length).toBeGreaterThan(0);
  });

  it("filters the workspace to a selected category", () => {
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: /Infrastructure/ })[0]);
    expect(screen.getByRole("heading", { name: "Infrastructure" })).toBeInTheDocument();
    expect(screen.getAllByText("Linux").length).toBeGreaterThan(0);
  });

  it("uses an accessible Switch status control and toggles on click", () => {
    renderPage();
    // Switch renders in both desktop table and mobile card list.
    const switches = screen.getAllByRole("switch", { name: "Deactivate Linux" });
    expect(switches[0]).toHaveAttribute("aria-checked", "true");
    fireEvent.click(switches[0]);
    expect(updateSkillMutation.mutate).toHaveBeenCalledWith(
      { id: 10, data: { is_active: false } },
      expect.any(Object)
    );
  });

  it("ignores repeated status clicks while a toggle is pending", () => {
    // Mock mutate to never call onSuccess — togglingId stays set,
    // blocking the second click.
    const pendingMutate = vi.fn();
    mocks.updateSkill.mockReturnValue({
      mutate: pendingMutate,
      mutateAsync: vi.fn(),
      isPending: true,
    });
    renderPage();
    const switches = screen.getAllByRole("switch", { name: "Deactivate Linux" });
    fireEvent.click(switches[0]);
    fireEvent.click(switches[0]);
    expect(pendingMutate).toHaveBeenCalledTimes(1);
  });

  it("opens confirmation for selected skills", () => {
    renderPage();
    // Desktop table renders the select button; mobile also renders one.
    // Click the first one (desktop is first in DOM order).
    fireEvent.click(screen.getAllByRole("button", { name: "Select Linux" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    expect(screen.getByText("Delete skill?")).toBeInTheDocument();
  });

  it("shows catalog errors without a false empty state", () => {
    mocks.useSkills.mockReturnValue({
      data: [],
      isLoading: false,
      error: new Error("unavailable"),
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText("Failed to load skills")).toBeInTheDocument();
    expect(screen.queryByText("No skills here yet")).not.toBeInTheDocument();
  });
});
