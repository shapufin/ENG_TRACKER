import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CRBulkCommandDrawer } from "./CRBulkCommandDrawer";

vi.mock("../hooks/useControlRoomAccess", () => ({
  useBulkUpdateCRUsers: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("./TeamMultiSelect", () => ({
  TeamMultiSelect: ({ value, onChange }: any) => (
    <div data-testid="team-multi-select">
      <button onClick={() => onChange([1, 2])}>pick teams</button>
    </div>
  ),
}));

vi.mock("@/components/ui/tabs", () => {
  const { Children, cloneElement } = React;
  return {
    Tabs: ({ children }: any) => <div data-testid="tabs">{children}</div>,
    TabsList: ({ children }: any) => <div role="tablist">{children}</div>,
    TabsTrigger: ({ children, ...rest }: any) => (
      <button role="tab" {...rest}>
        {children}
      </button>
    ),
    TabsContent: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
  };
});

const renderDrawer = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CRBulkCommandDrawer
        open
        onOpenChange={vi.fn()}
        selectedUserIds={[1]}
        selectedNames={["alice"]}
        teams={[]}
        onClearSelection={vi.fn()}
      />
    </QueryClientProvider>
  );
};

// Scroll contract: tabs + apply buttons must not scroll away with content.
describe("CRBulkCommandDrawer scroll contract", () => {
  it("dialog is a bounded flex column with a scrollable body", () => {
    renderDrawer();
    expect(screen.getByText("CR Bulk Actions")).toBeInTheDocument();
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("flex-col");
    expect(dlg.className).toContain("overflow-hidden");
    expect(dlg.className).not.toContain("overflow-y-auto");
    expect(document.querySelectorAll(".flex-1.overflow-y-auto").length).toBeGreaterThan(0);
  });

  it("section labels are associated with their control groups", () => {
    renderDrawer();
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    // Each bare Label is wired via aria-labelledby on its group container.
    expect(dlg.querySelectorAll("[aria-labelledby]").length).toBeGreaterThan(0);
  });

  it("tabs and apply button live outside the scrollable body", () => {
    renderDrawer();
    const body = document.querySelector(".flex-1.overflow-y-auto") as HTMLElement;
    expect(body).not.toBeNull();
    // TabsList must not scroll away with the content.
    const tablist = document.querySelector("[role='tablist']");
    expect(tablist).not.toBeNull();
    expect(body.contains(tablist)).toBe(false);
    // Apply button must sit in a sticky footer, not inside the scroll body.
    const apply = screen.getByText("Replace Scopes for 1 Users");
    expect(body.contains(apply)).toBe(false);
    expect(apply.closest(".shrink-0.border-t")).not.toBeNull();
  });
});
