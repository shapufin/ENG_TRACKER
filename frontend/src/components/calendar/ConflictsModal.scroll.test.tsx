import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ConflictsModal } from "./ConflictsModal";

const conflicts = [
  {
    date: "2026-09-10",
    description: "Understaffed",
    users: [{ id: 1, name: "Enri Demnushi", type: "vacation", status: "approved" }],
  },
] as any;

const dialogClass = () =>
  (document.querySelector("[role='dialog']") as HTMLElement | null)?.className ?? "";

// Scroll contract: header stays visible, only the body scrolls. A fixed
// h-[80vh] shell renders an 80vh-tall dialog even for the empty state.
describe("ConflictsModal scroll contract", () => {
  it("dialog is a bounded flex column, not a fixed-height whole-scroll shell", () => {
    render(<ConflictsModal open onOpenChange={vi.fn()} conflicts={conflicts} />);
    const cls = dialogClass();
    expect(cls).toContain("flex-col");
    expect(cls).toContain("overflow-hidden");
    expect(cls).not.toContain("overflow-y-auto");
    expect(cls).not.toMatch(/(^|\s)h-\[80vh\]/);
  });

  it("matches the mockup surface: rounded-3xl shell with a bar-free scroll body", () => {
    render(<ConflictsModal open onOpenChange={vi.fn()} conflicts={conflicts} />);
    const dlg = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dlg.className).toContain("sm:rounded-3xl");
    const body = document.querySelector(".flex-1.overflow-y-auto") as HTMLElement;
    expect(body.className).toContain("no-scrollbar");
  });

  it("long conflict lists scroll in the body while the header stays put", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`,
      description: `Conflict ${i}`,
      users: [{ id: i, name: `User ${i}`, type: "vacation", status: "approved" }],
    })) as any;
    render(<ConflictsModal open onOpenChange={vi.fn()} conflicts={many} />);
    expect(document.querySelectorAll(".flex-1.overflow-y-auto").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".shrink-0").length).toBeGreaterThan(0);
  });

  it("custom close button meets the 44px touch target", () => {
    render(<ConflictsModal open onOpenChange={vi.fn()} conflicts={[]} />);
    const close = document.querySelector("[role='dialog'] button") as HTMLElement | null;
    expect(close).not.toBeNull();
    expect(close!.className).toContain("h-11");
    expect(close!.className).toContain("w-11");
  });
});
