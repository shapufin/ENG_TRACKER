import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CRBulkCommandDrawer } from "./CRBulkCommandDrawer";

// Mock the bulk mutation hook so we can capture calls without hitting the API.
const mockMutate = vi.fn();
const mockMutateAsync = vi.fn();
vi.mock("../hooks/useControlRoomAccess", () => ({
  useBulkUpdateCRUsers: () => ({
    mutate: mockMutate,
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

// Mock TeamMultiSelect to keep the test focused on the drawer shell.
vi.mock("./TeamMultiSelect", () => ({
  TeamMultiSelect: ({ value, onChange }: any) => (
    <div data-testid="team-multi-select">
      <span data-testid="selected-count">{value.length}</span>
      <button onClick={() => onChange([1, 2])}>pick teams</button>
    </div>
  ),
}));

// Mock Tabs to avoid radix pointer-event issues in jsdom. The active tab
// is shared via context so nested TabsList/TabsContent (inside the drawer's
// scroll/footer layout) still respond to trigger clicks.
vi.mock("@/components/ui/tabs", () => {
  const { createContext, useContext, useState } = React;
  const TabCtx = createContext<{ active: string; change: (v: string) => void }>({
    active: "scopes",
    change: () => {},
  });
  return {
    Tabs: ({ value, onValueChange, children }: any) => {
      const [active, setActive] = useState(value || "scopes");
      const change = (v: string) => {
        setActive(v);
        onValueChange?.(v);
      };
      return (
        <div data-testid="tabs" data-active={active}>
          <TabCtx.Provider value={{ active, change }}>{children}</TabCtx.Provider>
        </div>
      );
    },
    TabsList: ({ children, ...rest }: any) => (
      <div data-testid="tabs-list" role="tablist" {...rest}>
        {children}
      </div>
    ),
    TabsTrigger: ({ value, children, ...rest }: any) => {
      const { active, change } = useContext(TabCtx);
      return (
        <button
          role="tab"
          data-state={active === value ? "active" : "inactive"}
          onClick={() => change?.(value)}
          {...rest}
        >
          {children}
        </button>
      );
    },
    TabsContent: ({ value, children, ...rest }: any) => {
      const { active } = useContext(TabCtx);
      return active === value ? (
        <div data-testid={`tab-content-${value}`} {...rest}>
          {children}
        </div>
      ) : null;
    },
  };
});

const teams = [
  { id: 1, name: "Team A", code: "TA" },
  { id: 2, name: "Team B", code: "TB" },
] as any;

const renderWithClient = (ui: React.ReactElement) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe("CRBulkCommandDrawer", () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mockMutateAsync.mockReset();
  });

  it("renders selected count and names", () => {
    renderWithClient(
      <CRBulkCommandDrawer
        open={true}
        onOpenChange={vi.fn()}
        selectedUserIds={[1, 2, 3]}
        selectedNames={["alice", "bob", "carol"]}
        teams={teams}
        onClearSelection={vi.fn()}
      />
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/alice, bob, carol/)).toBeInTheDocument();
  });

  it("truncates display name when more than 3 selected", () => {
    renderWithClient(
      <CRBulkCommandDrawer
        open={true}
        onOpenChange={vi.fn()}
        selectedUserIds={[1, 2, 3, 4, 5]}
        selectedNames={["alice", "bob", "carol", "dave", "eve"]}
        teams={teams}
        onClearSelection={vi.fn()}
      />
    );
    expect(screen.getByText(/alice, bob, carol \+2 more/)).toBeInTheDocument();
  });

  it("renders Team Scopes and Access tabs", () => {
    renderWithClient(
      <CRBulkCommandDrawer
        open={true}
        onOpenChange={vi.fn()}
        selectedUserIds={[1]}
        selectedNames={["alice"]}
        teams={teams}
        onClearSelection={vi.fn()}
      />
    );
    expect(screen.getByRole("tab", { name: /Team Scopes/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Access/i })).toBeInTheDocument();
  });

  it("calls mutate with team_ids on Apply Scopes", () => {
    const onOpenChange = vi.fn();
    const onClearSelection = vi.fn();
    renderWithClient(
      <CRBulkCommandDrawer
        open={true}
        onOpenChange={onOpenChange}
        selectedUserIds={[1, 2]}
        selectedNames={["alice", "bob"]}
        teams={teams}
        onClearSelection={onClearSelection}
      />
    );
    // Pick teams via the mocked TeamMultiSelect.
    fireEvent.click(screen.getByText("pick teams"));
    // Apply.
    fireEvent.click(screen.getByRole("button", { name: /Replace Scopes for 2 Users/i }));
    expect(mockMutate).toHaveBeenCalledWith(
      { user_ids: [1, 2], team_ids: [1, 2] },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      })
    );
  });

  it("disables Apply Scopes button when no users selected", () => {
    renderWithClient(
      <CRBulkCommandDrawer
        open={true}
        onOpenChange={vi.fn()}
        selectedUserIds={[]}
        selectedNames={[]}
        teams={teams}
        onClearSelection={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /Replace Scopes/i })).toBeDisabled();
  });

  it("switches to Access tab and toggles is_active", () => {
    renderWithClient(
      <CRBulkCommandDrawer
        open={true}
        onOpenChange={vi.fn()}
        selectedUserIds={[1]}
        selectedNames={["alice"]}
        teams={teams}
        onClearSelection={vi.fn()}
      />
    );
    // Click the Access tab trigger (mocked Tabs responds to click).
    fireEvent.click(screen.getByRole("tab", { name: /Access/i }));
    const enableAccess = screen.getByRole("button", { name: /Enable CR access/i });
    fireEvent.click(enableAccess);
    fireEvent.click(screen.getByRole("button", { name: /Update Access for 1 User/i }));
    expect(mockMutate).toHaveBeenCalledWith(
      { user_ids: [1], is_active: true },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      })
    );
  });

  it("clears selection and closes on Clear & Close", () => {
    const onOpenChange = vi.fn();
    const onClearSelection = vi.fn();
    renderWithClient(
      <CRBulkCommandDrawer
        open={true}
        onOpenChange={onOpenChange}
        selectedUserIds={[1]}
        selectedNames={["alice"]}
        teams={teams}
        onClearSelection={onClearSelection}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Clear & Close/i }));
    expect(onClearSelection).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows error banner when mutation onError fires", async () => {
    mockMutate.mockImplementation((_payload, opts: any) => {
      opts.onError({ response: { data: { error: "Boom" } } });
    });
    renderWithClient(
      <CRBulkCommandDrawer
        open={true}
        onOpenChange={vi.fn()}
        selectedUserIds={[1]}
        selectedNames={["alice"]}
        teams={teams}
        onClearSelection={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("pick teams"));
    fireEvent.click(screen.getByRole("button", { name: /Replace Scopes/i }));
    await waitFor(() => {
      expect(screen.getByText("Boom")).toBeInTheDocument();
    });
  });

  it("selected command option uses text-foreground, not text-primary", () => {
    renderWithClient(
      <CRBulkCommandDrawer
        open={true}
        onOpenChange={vi.fn()}
        selectedUserIds={[1]}
        selectedNames={["alice"]}
        teams={teams}
        onClearSelection={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("tab", { name: /access/i }));
    fireEvent.click(screen.getByRole("button", { name: /Enable CR access/ }));
    const option = screen.getByRole("button", { name: /Enable CR access/ });
    expect(option.className).toContain("text-foreground");
    expect(option.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
  });
});
