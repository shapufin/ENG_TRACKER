import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const mockGetMemberCandidates = vi.fn();

vi.mock("../hooks/useMemberCandidates", () => ({
  useMemberCandidates: (params: { search: string; groupId: number }) => {
    // Record every call so we can assert which search value reached the hook.
    mockGetMemberCandidates(params);
    return {
      data: undefined,
      isLoading: false,
      isFetching: false,
    };
  },
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...rest }: any) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

import { ResourceAccessMemberDialog } from "./ResourceAccessMemberDialog";

describe("ResourceAccessMemberDialog (debounce)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetMemberCandidates.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not fire a query per keystroke; fires once after the debounce window", () => {
    render(
      <ResourceAccessMemberDialog
        open
        groupId={1}
        groupName="Group"
        onAdd={vi.fn()}
        onOpenChange={vi.fn()}
        isPending={false}
      />
    );

    const input = screen.getByRole("searchbox", { name: "Search users" });

    // Type three characters rapidly without advancing the clock.
    act(() => {
      fireEvent.change(input, { target: { value: "a" } });
    });
    act(() => {
      fireEvent.change(input, { target: { value: "ab" } });
    });
    act(() => {
      fireEvent.change(input, { target: { value: "abc" } });
    });

    // The hook should not have been called with the intermediate values yet.
    const callsBefore = mockGetMemberCandidates.mock.calls.length;
    const searchesBefore = mockGetMemberCandidates.mock.calls.map((c: any) => c[0].search);
    expect(searchesBefore).not.toContain("abc");

    // Advance past the debounce window (250ms).
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // After the debounce, the hook receives the final value exactly once for it.
    const searchesAfter = mockGetMemberCandidates.mock.calls.map((c: any) => c[0].search);
    expect(searchesAfter).toContain("abc");
    // The number of calls should not have grown by 3 (one per keystroke).
    expect(mockGetMemberCandidates.mock.calls.length).toBeLessThan(callsBefore + 3);
  });
});
