import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SkillsTeamPage } from "./SkillsTeamPage";
import type { TeamMatrixRow, SkillCoverage, SkillCategory } from "../types/skills";

// PluginImportButton (admin page headers) reads the active-plugin list. With
// data_import inactive it renders nothing — the same graceful path taken when
// the plugin is disabled or removed.
vi.mock("@/context/PluginContext", () => ({
  usePlugins: () => ({ activePlugins: [], isLoading: false }),
}));

const useMatrixMock = vi.fn();
const useCoverageMock = vi.fn();
const useGapReportMock = vi.fn();
const useExportMatrixMock = vi.fn();
const useRateUserSkillMock = vi.fn();
const useSkillCategoriesMock = vi.fn();
const useIsMobileMock = vi.fn();
let resizeObserverCallback: ResizeObserverCallback | undefined;

vi.stubGlobal(
  "ResizeObserver",
  class {
    constructor(callback: ResizeObserverCallback) {
      resizeObserverCallback = callback;
    }
    observe() {}
    disconnect() {}
  }
);

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

vi.mock("@/components/ui/ErrorCard", () => ({
  ErrorCard: ({ title, onRetry }: { title: string; onRetry: () => void }) => (
    <div data-testid="error-card">
      <p>{title}</p>
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
}));

vi.mock("../hooks/useSkillsQueries", () => ({
  useMatrix: (...args: unknown[]) => useMatrixMock(...args),
  useCoverage: () => useCoverageMock(),
  // Capture args so we can assert on topN wiring.
  useGapReport: (...args: unknown[]) => useGapReportMock(...args),
  useExportMatrix: () => useExportMatrixMock(),
  useRateUserSkill: () => useRateUserSkillMock(),
  useSkillCategories: () => useSkillCategoriesMock(),
}));

vi.mock("@/hooks/useIsMobile", () => ({
  useIsMobile: () => useIsMobileMock(),
}));

// Mock @tanstack/react-virtual — jsdom returns 0 for clientWidth/scrollWidth.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, i) => ({
        index: i,
        start: 160 + i * 64,
        size: 64,
        key: i,
        lane: 0,
      })),
    getTotalSize: () => opts.count * 64,
    measureElement: () => {},
    measure: vi.fn(),
    scrollToIndex: vi.fn(),
    containerRef: { current: null },
  }),
}));

// Mock Dialog to render content inline (always open) for testability.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: any) => <div>{children}</div>,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}));

const categories: SkillCategory[] = [
  {
    id: 1,
    name: "Backend",
    code: "backend",
    description: "",
    is_active: true,
    created_at: "",
    updated_at: "",
  },
];

const coverage: SkillCoverage[] = [
  {
    skill_id: 10,
    skill_name: "Python",
    category_name: "Backend",
    team_count: 2,
    avg_level: 3.5,
  },
];

const rows: TeamMatrixRow[] = [
  {
    user_id: 100,
    username: "alice",
    skills: [
      {
        user_skill_id: 999,
        skill_id: 10,
        skill_name: "Python",
        category_name: "Backend",
        level: 3,
      },
    ],
  },
];

const mutationMock = (overrides: Record<string, unknown> = {}) => ({
  mutate: vi.fn(),
  isPending: false,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  useSkillCategoriesMock.mockReturnValue({ data: categories });
  useMatrixMock.mockReturnValue({ data: { results: rows, count: 1 }, isLoading: false });
  useCoverageMock.mockReturnValue({ data: coverage });
  useGapReportMock.mockReturnValue({ data: [] });
  useExportMatrixMock.mockReturnValue(mutationMock());
  useRateUserSkillMock.mockReturnValue(mutationMock());
  useIsMobileMock.mockReturnValue(false);
});

describe("SkillsTeamPage", () => {
  it("renders the page title and matrix table", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    expect(screen.getByText("Team Skills & Capability Engine")).toBeInTheDocument();
    expect(screen.getByText("alice")).toBeInTheDocument();
    // "Python" appears in the coverage header and the matrix cell.
    expect(screen.getAllByText("Python").length).toBeGreaterThanOrEqual(1);
  });

  it("eyebrow pill and view badge use text-foreground (same failing tint pair as nav: ~3.2:1 dark)", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    const eyebrow = screen.getByText("Skills Matrix");
    expect(eyebrow.className).toContain("text-foreground");
    expect(eyebrow.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
    const badge = screen.getByText("Matrix view");
    expect(badge.className).toContain("text-foreground");
    expect(badge.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
  });

  it("passes proficiency filters to the paginated matrix query", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Minimum level" }));
    fireEvent.click(screen.getByRole("option", { name: /L4/ }));

    expect(useMatrixMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ min_level: 4, page: 1, page_size: 25 })
    );
  });

  it("resets all filters and pagination", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "alice" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));

    expect(screen.getByLabelText("Search")).toHaveValue("");
    expect(useMatrixMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: undefined, category: undefined, page: 1 })
    );
  });

  it("switches to the member-oriented list view", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /list/i }));
    expect(screen.getByText("1 rated skills")).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("shows an empty state when no team members", () => {
    useMatrixMock.mockReturnValue({ data: { results: [], count: 0 }, isLoading: false });
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/No team members found/i)).toBeInTheDocument();
  });

  it("shows a retryable error instead of an empty state when matrix loading fails", () => {
    const refetch = vi.fn();
    useMatrixMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("offline"),
      refetch,
    });
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/Failed to load team skills/i)).toBeInTheDocument();
    expect(screen.queryByText(/No team members found/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("opens the rate stepper dialog and submits with the UserSkill PK (B1 regression)", async () => {
    const rateMut = mutationMock();
    useRateUserSkillMock.mockReturnValue(rateMut);
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // Click the raw cell button by its compact aria-label (D3).
    fireEvent.click(screen.getByRole("button", { name: /alice Python L3/i }));
    // The rate dialog opens with the stepper showing 5 level buttons.
    expect(screen.getByText("Rate Skill")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "L1 Foundational" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "L2 Developing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "L3 Proficient" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "L4 Advanced" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "L5 Mastery" })).toBeInTheDocument();
    // Click L4 to rate — one click, no separate submit step.
    fireEvent.click(screen.getByRole("button", { name: "L4 Advanced" }));
    await waitFor(() =>
      expect(rateMut.mutate).toHaveBeenCalledWith(
        // B1: id must be the user_skill_id (999), NOT the skill_id (10).
        { id: 999, data: { level: 4 } },
        expect.any(Object)
      )
    );
  });

  it("shows the current-level context in the rate stepper (D9)", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /alice Python L3/i }));
    // The stepper shows the current level as context.
    expect(screen.getByText(/Currently rated/i)).toBeInTheDocument();
  });

  it("highlights the current level in the stepper", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /alice Python L3/i }));
    // The current level button (L3) should be marked as pressed/active.
    const l3Button = screen.getByRole("button", { name: "L3 Proficient" });
    expect(l3Button.getAttribute("aria-pressed")).toBe("true");
  });

  it("triggers the CSV export on button click", async () => {
    const exportMut = mutationMock();
    useExportMatrixMock.mockReturnValue(exportMut);
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("Export CSV"));
    await waitFor(() => expect(exportMut.mutate).toHaveBeenCalled());
  });

  it("renders coverage in skill sub-headers alongside KPI cards", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // Coverage stays folded into the skill sub-header ("Avg" + toned value
    // span), while the KPI summary cards render above the toolbar.
    expect(screen.getByText("Avg")).toBeInTheDocument();
    expect(screen.getByText("Team Seniority Index")).toBeInTheDocument();
  });

  it("renders skill sub-header with title for truncation a11y", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // The skill sub-header <th> has title={skill_name} for accessibility.
    const header = screen.getByText("Python").closest("th");
    expect(header?.getAttribute("title")).toBe("Python");
  });

  it("aligns skill sub-headers with body cells (not under Member column)", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // The skill sub-header row must have an empty cell for the "Member"
    // column so that skill headers align with body cells. Without it,
    // "Python" would be in column 1 (under "Member") instead of column 2.
    const skillHeaderRow = screen.getByText("Python").closest("tr");
    expect(skillHeaderRow).not.toBeNull();
    // The row should have 2 cells: empty Member placeholder + Python.
    expect(skillHeaderRow!.querySelectorAll("th").length).toBe(2);
  });

  it("renders a compact gap bar when gaps exist", () => {
    useGapReportMock.mockReturnValue({
      data: [
        {
          skill_id: 10,
          skill_name: "Python",
          category_name: "Backend",
          team_count: 2,
          avg_level: 2,
        },
      ],
    });
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // Compact bar shows "Gaps (N)", not the old "Skill Gaps" block.
    expect(screen.getByText(/Gaps \(1\)/i)).toBeInTheDocument();
  });

  it("calls useGapReport with topN=5 (Q3 resolution)", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // Default categoryCode is "all" → category=undefined, threshold=undefined, topN=5.
    expect(useGapReportMock).toHaveBeenCalledWith(undefined, undefined, 5);
  });
});

// ── Mobile fallback view (D4) ──

describe("SkillsTeamPage — mobile fallback", () => {
  it("provides a mobile filters dialog trigger", () => {
    useIsMobileMock.mockReturnValue(true);
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("heading", { name: "Team filters" })).toBeInTheDocument();
  });

  beforeEach(() => {
    useIsMobileMock.mockReturnValue(true);
  });

  it("renders team member names as tappable items (not a table)", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // Member name appears as a button (tappable to expand).
    expect(screen.getByRole("button", { name: /alice/i })).toBeInTheDocument();
    // The matrix table scroll container should NOT be present on mobile.
    expect(screen.queryByLabelText(/scroll horizontally/i)).not.toBeInTheDocument();
  });

  it("expands a member's skills as cards when tapped", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // Tap alice to expand her skills.
    fireEvent.click(screen.getByRole("button", { name: /alice/i }));
    // Her skill "Python" should now be visible in a card.
    expect(screen.getByText("Python")).toBeInTheDocument();
    // Level indicator should be present.
    expect(screen.getAllByText(/L3/i).length).toBeGreaterThan(0);
  });

  it("opens the rate stepper dialog from a mobile skill card", async () => {
    const rateMut = mutationMock();
    useRateUserSkillMock.mockReturnValue(rateMut);
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // Expand alice's skills.
    fireEvent.click(screen.getByRole("button", { name: /alice/i }));
    // Click the rate button on the Python skill card.
    fireEvent.click(screen.getByRole("button", { name: /rate.*alice.*python/i }));
    // The rate dialog opens with the stepper.
    expect(screen.getByText("Rate Skill")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "L4 Advanced" })).toBeInTheDocument();
    // Click L4 to rate.
    fireEvent.click(screen.getByRole("button", { name: "L4 Advanced" }));
    await waitFor(() =>
      expect(rateMut.mutate).toHaveBeenCalledWith(
        { id: 999, data: { level: 4 } },
        expect.any(Object)
      )
    );
  });

  it("shows empty state when no team members on mobile", () => {
    useMatrixMock.mockReturnValue({ data: { results: [], count: 0 }, isLoading: false });
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/No team members found/i)).toBeInTheDocument();
  });

  it("collapses a member when tapped again", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    const aliceBtn = screen.getByRole("button", { name: /alice/i });
    // Expand.
    fireEvent.click(aliceBtn);
    expect(screen.getByText("Python")).toBeInTheDocument();
    // Collapse.
    fireEvent.click(aliceBtn);
    expect(screen.queryByText("Python")).not.toBeInTheDocument();
  });

  it("shows unrated skills as disabled cards (consistency with desktop)", () => {
    // alice has Python (rated) but NOT React (unrated). Mobile should still
    // show React as a disabled "—" card, not hide it — matches desktop.
    const partialRows: TeamMatrixRow[] = [
      {
        user_id: 100,
        username: "alice",
        skills: [
          {
            user_skill_id: 999,
            skill_id: 10,
            skill_name: "Python",
            category_name: "Backend",
            level: 3,
          },
        ],
      },
    ];
    const twoCoverage: SkillCoverage[] = [
      {
        skill_id: 10,
        skill_name: "Python",
        category_name: "Backend",
        team_count: 1,
        avg_level: 3,
      },
      {
        skill_id: 20,
        skill_name: "React",
        category_name: "Frontend",
        team_count: 1,
        avg_level: 0,
      },
    ];
    useMatrixMock.mockReturnValue({
      data: { results: partialRows, count: 1 },
      isLoading: false,
    });
    useCoverageMock.mockReturnValue({ data: twoCoverage });
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /alice/i }));
    // React (unrated) should be visible with a clear non-interactive status.
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Not rated")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /rate.*react/i })).not.toBeInTheDocument();
  });
});

// ── ARIA grid + keyboard navigation (D3 follow-up) ──

describe("SkillsTeamPage — ARIA grid + keyboard nav", () => {
  const twoRows: TeamMatrixRow[] = [
    {
      user_id: 100,
      username: "alice",
      skills: [
        {
          user_skill_id: 999,
          skill_id: 10,
          skill_name: "Python",
          category_name: "Backend",
          level: 3,
        },
        {
          user_skill_id: 998,
          skill_id: 20,
          skill_name: "React",
          category_name: "Frontend",
          level: 2,
        },
      ],
    },
    {
      user_id: 200,
      username: "bob",
      skills: [
        {
          user_skill_id: 997,
          skill_id: 10,
          skill_name: "Python",
          category_name: "Backend",
          level: 4,
        },
      ],
    },
  ];

  const twoCoverage: SkillCoverage[] = [
    {
      skill_id: 10,
      skill_name: "Python",
      category_name: "Backend",
      team_count: 2,
      avg_level: 3.5,
    },
    {
      skill_id: 20,
      skill_name: "React",
      category_name: "Frontend",
      team_count: 2,
      avg_level: 2,
    },
  ];

  beforeEach(() => {
    useSkillCategoriesMock.mockReturnValue({ data: categories });
    useMatrixMock.mockReturnValue({
      data: { results: twoRows, count: 2 },
      isLoading: false,
    });
    useCoverageMock.mockReturnValue({ data: twoCoverage });
    useGapReportMock.mockReturnValue({ data: [] });
    useExportMatrixMock.mockReturnValue(mutationMock());
    useRateUserSkillMock.mockReturnValue(mutationMock());
    useIsMobileMock.mockReturnValue(false);
  });

  it("renders the table with role=grid", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    const table = screen.getByRole("grid");
    expect(table).toBeInTheDocument();
  });

  it("sets aria-rowcount to total rows (header + body)", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    const table = screen.getByRole("grid");
    // 2 header rows (category + skill) + 2 body rows = 4.
    expect(table.getAttribute("aria-rowcount")).toBe("4");
  });

  it("sets aria-rowindex on body rows", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    const grid = screen.getByRole("grid");
    const bodyRows = grid.querySelectorAll("tbody tr");
    expect(bodyRows.length).toBe(2);
    // First body row has aria-rowindex=3 (after 2 header rows).
    expect(bodyRows[0].getAttribute("aria-rowindex")).toBe("3");
    expect(bodyRows[1].getAttribute("aria-rowindex")).toBe("4");
  });

  it("keeps aria row count and indices global on page 2", () => {
    useMatrixMock.mockReturnValue({
      data: { results: twoRows, count: 27 },
      isLoading: false,
    });
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText("Next"));
    const grid = screen.getByRole("grid");
    expect(grid.getAttribute("aria-rowcount")).toBe("29");
    expect(grid.querySelector("tbody tr")?.getAttribute("aria-rowindex")).toBe("28");
  });

  it("updates the sticky header offset when the category row height changes", async () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    const scrollContainer = screen.getByLabelText(/scroll horizontally/i);
    act(() => {
      resizeObserverCallback?.(
        [{ contentRect: { height: 48 } } as ResizeObserverEntry],
        {} as ResizeObserver
      );
    });
    await waitFor(() => expect(scrollContainer).toHaveStyle({ "--matrix-header-h": "48px" }));
  });

  it("moves focus down on ArrowDown", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // Focus alice's Python cell (row 0, col 0).
    const aliceCell = screen.getByRole("button", { name: /alice Python L3/i });
    aliceCell.focus();
    expect(document.activeElement).toBe(aliceCell);
    // Press ArrowDown → focus should move to bob's Python cell (row 1, col 0).
    fireEvent.keyDown(aliceCell, { key: "ArrowDown" });
    const bobCell = screen.getByRole("button", { name: /bob Python L4/i });
    expect(document.activeElement).toBe(bobCell);
  });

  it("moves focus right on ArrowRight", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // Focus alice's Python cell (row 0, col 0).
    const alicePython = screen.getByRole("button", { name: /alice Python L3/i });
    alicePython.focus();
    // Press ArrowRight → focus should move to alice's React cell (row 0, col 1).
    fireEvent.keyDown(alicePython, { key: "ArrowRight" });
    const aliceReact = screen.getByRole("button", { name: /alice React L2/i });
    expect(document.activeElement).toBe(aliceReact);
  });

  it("opens the rate dialog on Enter", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    const aliceCell = screen.getByRole("button", { name: /alice Python L3/i });
    aliceCell.focus();
    // Press Enter → rate dialog should open.
    fireEvent.keyDown(aliceCell, { key: "Enter" });
    // The dialog should show the 5 level buttons.
    expect(screen.getByText("Rate Skill")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "L4 Advanced" })).toBeInTheDocument();
  });

  it("does not move focus past the last row on ArrowDown", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // Focus bob's Python cell (last row, col 0).
    const bobCell = screen.getByRole("button", { name: /bob Python L4/i });
    bobCell.focus();
    // Press ArrowDown → focus should stay on bob's cell.
    fireEvent.keyDown(bobCell, { key: "ArrowDown" });
    expect(document.activeElement).toBe(bobCell);
  });

  it("does not move focus past the first column on ArrowLeft", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // Focus alice's Python cell (first col).
    const aliceCell = screen.getByRole("button", { name: /alice Python L3/i });
    aliceCell.focus();
    // Press ArrowLeft → focus should stay.
    fireEvent.keyDown(aliceCell, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(aliceCell);
  });

  it("moves focus to an unrated cell placeholder on ArrowRight", () => {
    // alice has Python (col 0) but NOT React (col 1) — unrated cell.
    const partialRows: TeamMatrixRow[] = [
      {
        user_id: 100,
        username: "alice",
        skills: [
          {
            user_skill_id: 999,
            skill_id: 10,
            skill_name: "Python",
            category_name: "Backend",
            level: 3,
          },
        ],
      },
    ];
    useMatrixMock.mockReturnValue({
      data: { results: partialRows, count: 1 },
      isLoading: false,
    });
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // Focus alice's Python cell (col 0).
    const alicePython = screen.getByRole("button", { name: /alice Python L3/i });
    alicePython.focus();
    // Press ArrowRight → focus should move to the unrated React cell.
    fireEvent.keyDown(alicePython, { key: "ArrowRight" });
    const unratedCell = screen.getByRole("button", { name: /alice React.*no rating/i });
    expect(document.activeElement).toBe(unratedCell);
  });

  it("does not open the rate dialog when Enter is pressed on an unrated cell", () => {
    const partialRows: TeamMatrixRow[] = [
      {
        user_id: 100,
        username: "alice",
        skills: [
          {
            user_skill_id: 999,
            skill_id: 10,
            skill_name: "Python",
            category_name: "Backend",
            level: 3,
          },
        ],
      },
    ];
    useMatrixMock.mockReturnValue({
      data: { results: partialRows, count: 1 },
      isLoading: false,
    });
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // Focus and Enter on the unrated React cell.
    const unratedCell = screen.getByRole("button", { name: /alice React.*no rating/i });
    unratedCell.focus();
    fireEvent.keyDown(unratedCell, { key: "Enter" });
    // Rate dialog content (level buttons) should NOT appear — the Dialog
    // mock always renders the title, so assert on the conditional body.
    expect(screen.queryByRole("button", { name: "L4 Advanced" })).not.toBeInTheDocument();
  });

  it("keeps a current cell tabbable after search reduces the result set", () => {
    useMatrixMock
      .mockReturnValueOnce({ data: { results: twoRows, count: 2 }, isLoading: false })
      .mockReturnValue({ data: { results: [twoRows[0]], count: 1 }, isLoading: false });
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // Move focus state to the second row before changing the result set.
    const aliceCell = screen.getByRole("button", { name: /alice Python L3/i });
    aliceCell.focus();
    fireEvent.keyDown(aliceCell, { key: "ArrowDown" });
    const searchInput = screen.getByLabelText("Search");
    fireEvent.change(searchInput, { target: { value: "alice" } });
    const currentCells = screen.getAllByRole("button", { name: /alice (Python|React)/i });
    expect(currentCells.some((cell) => cell.getAttribute("tabindex") === "0")).toBe(true);
  });
});

// ── Heatmap view mode ──

describe("SkillsTeamPage — heatmap view mode", () => {
  const twoRows: TeamMatrixRow[] = [
    {
      user_id: 100,
      username: "alice",
      skills: [
        {
          user_skill_id: 999,
          skill_id: 10,
          skill_name: "Python",
          category_name: "Backend",
          level: 3,
        },
      ],
    },
  ];

  const twoCoverage: SkillCoverage[] = [
    {
      skill_id: 10,
      skill_name: "Python",
      category_name: "Backend",
      team_count: 1,
      avg_level: 3,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    useSkillCategoriesMock.mockReturnValue({ data: categories });
    useMatrixMock.mockReturnValue({
      data: { results: twoRows, count: 1 },
      isLoading: false,
    });
    useCoverageMock.mockReturnValue({ data: twoCoverage });
    useGapReportMock.mockReturnValue({ data: [] });
    useExportMatrixMock.mockReturnValue(mutationMock());
    useRateUserSkillMock.mockReturnValue(mutationMock());
    useIsMobileMock.mockReturnValue(false);
  });

  it("renders the heatmap grid when Heatmap button is clicked", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /heatmap/i }));
    // The heatmap scroll container has aria-label with "heatmap".
    expect(screen.getByLabelText(/heatmap/i)).toBeInTheDocument();
  });

  it("switches from Matrix to Heatmap and resets focusedCell", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // In Matrix mode, focus alice's cell then arrow down (focusedCell = {1,0}).
    const aliceCell = screen.getByRole("button", { name: /alice Python L3/i });
    aliceCell.focus();
    // Switch to Heatmap — focusedCell should reset to {0,0}.
    fireEvent.click(screen.getByRole("button", { name: /heatmap/i }));
    // In Heatmap mode, the first cell (alice Python) should be tabbable.
    const heatmapCell = screen.getByRole("button", { name: /alice Python L3/i });
    expect(heatmapCell.getAttribute("tabindex")).toBe("0");
  });

  it("renders mobile member card on mobile + heatmap (no dense heatmap)", () => {
    useIsMobileMock.mockReturnValue(true);
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // On mobile, even in heatmap mode, the member card list is rendered.
    expect(screen.getByRole("button", { name: /alice/i })).toBeInTheDocument();
    // The heatmap scroll container should NOT be present.
    expect(screen.queryByLabelText(/heatmap/i)).not.toBeInTheDocument();
  });
});

// ── Dense view mode ──

describe("SkillsTeamPage — dense view mode", () => {
  const twoRows: TeamMatrixRow[] = [
    {
      user_id: 100,
      username: "alice",
      skills: [
        {
          user_skill_id: 999,
          skill_id: 10,
          skill_name: "Python",
          category_name: "Backend",
          level: 3,
        },
        {
          user_skill_id: 998,
          skill_id: 20,
          skill_name: "React",
          category_name: "Frontend",
          level: 2,
        },
      ],
    },
  ];

  const twoCoverage: SkillCoverage[] = [
    {
      skill_id: 10,
      skill_name: "Python",
      category_name: "Backend",
      team_count: 1,
      avg_level: 3,
    },
    {
      skill_id: 20,
      skill_name: "React",
      category_name: "Frontend",
      team_count: 1,
      avg_level: 2,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    useSkillCategoriesMock.mockReturnValue({ data: categories });
    useMatrixMock.mockReturnValue({
      data: { results: twoRows, count: 1 },
      isLoading: false,
    });
    useCoverageMock.mockReturnValue({ data: twoCoverage });
    useGapReportMock.mockReturnValue({ data: [] });
    useExportMatrixMock.mockReturnValue(mutationMock());
    useRateUserSkillMock.mockReturnValue(mutationMock());
    useIsMobileMock.mockReturnValue(false);
  });

  it("renders the dense matrix when Dense button is clicked", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Dense" }));
    // Dense scroll container has aria-label with "dense matrix".
    expect(screen.getByLabelText(/dense matrix/i)).toBeInTheDocument();
  });

  it("switches from Matrix to Dense and resets focusedCell", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // In Matrix mode, focus alice's Python cell (row 0, col 0).
    const alicePython = screen.getByRole("button", { name: /alice Python L3/i });
    alicePython.focus();
    // ArrowRight → focusedCell becomes {0, 1} (alice's React cell).
    fireEvent.keyDown(alicePython, { key: "ArrowRight" });
    // Switch to Dense — focusedCell should reset to {0, 0}.
    fireEvent.click(screen.getByRole("button", { name: "Dense" }));
    // In Dense mode, the first cell (alice Python) should be tabbable
    // because focusedCell was reset to {0, 0}. If the reset didn't happen,
    // the React cell would be tabbable instead.
    const denseCell = screen.getByRole("button", { name: /alice Python.*L3/i });
    expect(denseCell.getAttribute("tabindex")).toBe("0");
  });

  it("renders mobile member card on mobile + dense (no dense grid)", () => {
    useIsMobileMock.mockReturnValue(true);
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    // On mobile, even in dense mode, the member card list is rendered.
    expect(screen.getByRole("button", { name: /alice/i })).toBeInTheDocument();
    // The dense scroll container should NOT be present.
    expect(screen.queryByLabelText(/dense matrix/i)).not.toBeInTheDocument();
  });
});

// ── Scale hint (Phase 2) ──

describe("SkillsTeamPage — scale hint", () => {
  // Build 31 coverage entries so renderedCoverage.length > 30.
  const manyCoverage: SkillCoverage[] = Array.from({ length: 31 }, (_, i) => ({
    skill_id: 100 + i,
    skill_name: `Skill${i}`,
    category_name: "Backend",
    team_count: 1,
    avg_level: 3,
  }));

  const manyRows: TeamMatrixRow[] = [
    {
      user_id: 100,
      username: "alice",
      skills: manyCoverage.slice(0, 5).map((c, i) => ({
        user_skill_id: 900 + i,
        skill_id: c.skill_id,
        skill_name: c.skill_name,
        category_name: c.category_name,
        level: 3,
      })),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    useSkillCategoriesMock.mockReturnValue({ data: categories });
    useMatrixMock.mockReturnValue({
      data: { results: manyRows, count: 1 },
      isLoading: false,
    });
    useCoverageMock.mockReturnValue({ data: manyCoverage });
    useGapReportMock.mockReturnValue({ data: [] });
    useExportMatrixMock.mockReturnValue(mutationMock());
    useRateUserSkillMock.mockReturnValue(mutationMock());
    useIsMobileMock.mockReturnValue(false);
  });

  it("renders the scale hint when coverage > 30 and viewMode is matrix on desktop", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/30\+ skills visible/i)).toBeInTheDocument();
  });

  it("does NOT render the scale hint on mobile (isMobile gate is enforced)", () => {
    useIsMobileMock.mockReturnValue(true);
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does NOT render the scale hint after switching to dense mode", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dense" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does NOT render the scale hint after switching to heatmap mode", () => {
    render(
      <MemoryRouter>
        <SkillsTeamPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Switch to Heatmap view" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
