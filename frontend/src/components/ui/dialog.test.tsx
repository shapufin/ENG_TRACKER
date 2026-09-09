import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

describe("Dialog mobile presentation", () => {
  it("keeps content within the viewport and exposes a touch-sized close control", () => {
    render(
      <Dialog open onOpenChange={() => undefined}>
        <DialogContent>
          <DialogTitle>Mobile dialog</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-h-[calc(100dvh-var(--safe-area-top)");
    expect(screen.getByRole("button", { name: "Close" }).className).toContain("h-11");
  });
});
