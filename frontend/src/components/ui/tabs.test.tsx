import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tabs, TabsList, TabsTrigger } from "./tabs";

describe("Tabs segmented control", () => {
  it("renders a sunken track with a raised card pill for the active tab", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList aria-label="Sections">
          <TabsTrigger value="a">Alpha</TabsTrigger>
          <TabsTrigger value="b">Beta</TabsTrigger>
        </TabsList>
      </Tabs>
    );
    const list = screen.getByRole("tablist", { name: "Sections" });
    expect(list.className).toContain("bg-surface-sunken");
    const active = screen.getByRole("tab", { name: "Alpha" });
    expect(active).toHaveAttribute("data-state", "active");
    expect(active.className).toContain("data-[state=active]:bg-card");
    expect(active.className).toContain("data-[state=active]:shadow-card");
    expect(active.className).toContain("data-[state=active]:text-foreground");
    expect(active.className).toContain("text-muted-foreground");
    expect(active.className).toContain("h-[var(--control-h-sm)]");
    expect(active.className).toContain("focus-visible:ring-2");
  });
});
