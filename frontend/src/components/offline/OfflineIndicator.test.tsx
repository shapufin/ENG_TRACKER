import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InlineOfflineBadge, OfflineIndicator } from "./OfflineIndicator";
import { useOfflineStatus } from "@/lib/offline/useOfflineStatus";

vi.mock("@/lib/offline/useOfflineStatus", () => ({
  useOfflineStatus: vi.fn(),
}));

const mockedUseOfflineStatus = vi.mocked(useOfflineStatus);

function setStatus(overrides: Partial<ReturnType<typeof useOfflineStatus>> = {}) {
  mockedUseOfflineStatus.mockReturnValue({
    isOnline: true,
    pendingCount: 0,
    isFlushing: false,
    hasStaleData: false,
    flush: vi.fn(),
    ...overrides,
  });
}

describe("OfflineIndicator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStatus();
  });

  it("renders nothing when online with an empty queue", () => {
    const { container } = render(<OfflineIndicator />);

    expect(container).toBeEmptyDOMElement();
  });

  it("marks cached responses as saved data while online", () => {
    setStatus({ hasStaleData: true });
    render(<OfflineIndicator />);

    expect(screen.getByText(/Showing saved data from your last connection/)).toBeInTheDocument();
  });

  it("shows pending changes and flushes when Sync now is clicked", () => {
    const flush = vi.fn();
    setStatus({ pendingCount: 1, flush });
    render(<OfflineIndicator />);

    expect(screen.getByText("1 change waiting to sync")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    expect(flush).toHaveBeenCalledOnce();
  });

  it("uses plural copy for multiple pending changes", () => {
    setStatus({ pendingCount: 3 });
    render(<OfflineIndicator />);

    expect(screen.getByText("3 changes waiting to sync")).toBeInTheDocument();
  });

  it("shows syncing state without a Sync now button", () => {
    setStatus({ pendingCount: 2, isFlushing: true });
    render(<OfflineIndicator />);

    expect(screen.getByText("Syncing 2 pending changes…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync now" })).not.toBeInTheDocument();
  });

  it("shows offline state with pending count", () => {
    setStatus({ isOnline: false, pendingCount: 2 });
    render(<OfflineIndicator />);

    expect(
      screen.getByText("You're offline — changes will sync when connected (2 pending)")
    ).toBeInTheDocument();
  });
});

describe("InlineOfflineBadge", () => {
  it("renders only while offline", () => {
    setStatus({ isOnline: false });
    const { rerender } = render(<InlineOfflineBadge />);

    expect(screen.getByText("Queued")).toBeInTheDocument();

    setStatus({ isOnline: true });
    rerender(<InlineOfflineBadge />);
    expect(screen.queryByText("Queued")).not.toBeInTheDocument();
  });
});
