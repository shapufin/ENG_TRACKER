import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageShell } from "./PageShell";

describe("PageShell mockup header treatment", () => {
  it("uses the mockup title style (text-2xl font-black, no responsive upsize)", () => {
    render(
      <PageShell title="Overtime" subtitle="Showing current month">
        <div data-testid="content" />
      </PageShell>
    );

    const title = screen.getByRole("heading", { level: 1, name: "Overtime" });
    expect(title.className).toContain("text-2xl");
    expect(title.className).toContain("font-black");
    expect(title.className).not.toContain("sm:text-4xl");
  });

  it("renders the mockup header bottom border", () => {
    render(
      <PageShell title="Overtime" subtitle="Showing current month">
        <div data-testid="content" />
      </PageShell>
    );

    const title = screen.getByRole("heading", { level: 1, name: "Overtime" });
    const headerRow = title.closest(".border-b");
    expect(headerRow).toBeTruthy();
    expect(headerRow?.className).toContain("pb-3");
    expect(headerRow?.className).toContain("border-line-subtle");
  });

  it("wraps action buttons on small screens", () => {
    render(
      <PageShell
        title="Standby"
        actions={
          <div data-testid="actions">
            <button>A</button>
            <button>B</button>
          </div>
        }
      >
        <div />
      </PageShell>
    );

    const actionsContainer = screen.getByTestId("actions").parentElement;
    expect(actionsContainer?.className).toContain("flex-wrap");
  });
});
