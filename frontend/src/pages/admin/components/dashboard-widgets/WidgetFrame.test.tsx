import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Users } from "lucide-react";
import { WidgetFrame } from "./WidgetFrame";

const base = { title: "My widget", description: "desc" };
const empty = { icon: Users, title: "Nothing here" };

describe("WidgetFrame", () => {
  it("renders children when loaded", () => {
    render(
      <WidgetFrame {...base} empty={null}>
        <p>content</p>
      </WidgetFrame>
    );
    expect(screen.getByText("My widget")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("shows a busy skeleton instead of children while loading", () => {
    render(
      <WidgetFrame {...base} isLoading empty={null}>
        <p>content</p>
      </WidgetFrame>
    );
    expect(screen.queryByText("content")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: /loading my widget/i })).toBeInTheDocument();
  });

  it("only marks the card for PDF export once data has loaded", () => {
    const { container, rerender } = render(
      <WidgetFrame {...base} sectionId="w" isLoading empty={null}>
        <p>content</p>
      </WidgetFrame>
    );
    expect(container.querySelector("[data-chart-section]")).toBeNull();
    rerender(
      <WidgetFrame {...base} sectionId="w" empty={null}>
        <p>content</p>
      </WidgetFrame>
    );
    expect(container.querySelector("[data-chart-section='w']")).not.toBeNull();
  });

  it("shows an error with a working retry", () => {
    const onRetry = vi.fn();
    render(
      <WidgetFrame {...base} isError onRetry={onRetry} empty={null}>
        <p>content</p>
      </WidgetFrame>
    );
    expect(screen.queryByText("content")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when told there is no data", () => {
    render(
      <WidgetFrame {...base} empty={empty}>
        <p>content</p>
      </WidgetFrame>
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });
});
