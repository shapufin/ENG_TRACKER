import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

// Suppress React's console.error noise from intentionally-thrown errors.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const ThrowOnRender = ({ shouldThrow = true }: { shouldThrow?: boolean }) => {
  if (shouldThrow) throw new Error("test-boom");
  return <div>ok</div>;
};

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div>hello</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders fallback UI when child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowOnRender />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
    expect(screen.getByText("Go Home")).toBeInTheDocument();
  });

  it("renders custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>custom-fallback</div>}>
        <ThrowOnRender />
      </ErrorBoundary>
    );
    expect(screen.getByText("custom-fallback")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("recovers when Retry is clicked after the child stops throwing", () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowOnRender shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Swap to a non-throwing child, then click Retry — the boundary
    // re-renders the (now safe) children instead of the fallback.
    rerender(
      <ErrorBoundary>
        <ThrowOnRender shouldThrow={false} />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByText("Retry"));
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("logs the error to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowOnRender />
      </ErrorBoundary>
    );
    expect(spy).toHaveBeenCalled();
  });
});
