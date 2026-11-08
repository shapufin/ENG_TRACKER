import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogTitle } from "./dialog";

const renderDialog = (content: React.ReactNode) =>
  render(
    <Dialog open onOpenChange={() => undefined}>
      {content}
    </Dialog>
  );

describe("Dialog mobile presentation", () => {
  it("keeps content within the viewport and exposes a touch-sized close control", () => {
    renderDialog(
      <DialogContent>
        <DialogTitle>Mobile dialog</DialogTitle>
      </DialogContent>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-h-[calc(100dvh-var(--safe-area-top)");
    expect(screen.getByRole("button", { name: "Close" }).className).toContain("h-11");
  });
});

describe("DialogContent side=bottom (phone sheet)", () => {
  it("pins to the bottom edge below md and stays the centred modal from md", () => {
    renderDialog(
      <DialogContent side="bottom">
        <DialogTitle>Sheet</DialogTitle>
      </DialogContent>
    );

    const cls = screen.getByRole("dialog").className;
    // Phone: full-width sheet on the bottom edge, rounded on top only, slides up.
    expect(cls).toContain("max-md:bottom-0");
    expect(cls).toContain("max-md:rounded-t-3xl");
    expect(cls).toContain("max-md:rounded-b-none");
    expect(cls).toContain("max-md:data-[state=open]:slide-in-from-bottom");
    // From md up it keeps the centred frame, so desktop dialogs do not change.
    expect(cls).toContain("left-[50%]");
    expect(cls).toContain("top-[50%]");
  });

  it("leaves the default centred modal untouched", () => {
    renderDialog(
      <DialogContent>
        <DialogTitle>Centre</DialogTitle>
      </DialogContent>
    );

    expect(screen.getByRole("dialog").className).not.toContain("max-md:bottom-0");
  });
});

describe("DialogContent size scale", () => {
  it.each([
    ["sm", "max-w-md"],
    ["md", "max-w-lg"],
    ["lg", "max-w-2xl"],
    ["xl", "max-w-4xl"],
  ] as const)("size=%s renders %s", (size, expected) => {
    renderDialog(
      <DialogContent size={size}>
        <DialogTitle>Sized</DialogTitle>
      </DialogContent>
    );
    expect(screen.getByRole("dialog").className).toContain(expected);
  });

  it("defaults to md and emits the width unprefixed so callsites can override", () => {
    renderDialog(
      <DialogContent>
        <DialogTitle>Default</DialogTitle>
      </DialogContent>
    );
    const className = screen.getByRole("dialog").className;
    expect(className).toContain("max-w-lg");
    expect(className).not.toContain("sm:max-w-lg");
  });
});

describe("DialogContent scroll contract", () => {
  it("owns overflow-hidden and never emits overflow-y on the container", () => {
    renderDialog(
      <DialogContent>
        <DialogTitle>Scrolling</DialogTitle>
        <DialogBody>body</DialogBody>
      </DialogContent>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("flex flex-col overflow-hidden");
    // `overflow-y-auto` is a different tailwind-merge group from
    // `overflow-hidden` — both would survive and re-create a double scroll.
    expect(dialog.className).not.toContain("overflow-y-auto");
  });

  it("puts the only scroller on DialogBody", () => {
    renderDialog(
      <DialogContent>
        <DialogTitle>Scrolling</DialogTitle>
        <DialogBody data-testid="body">body</DialogBody>
      </DialogContent>
    );

    const body = screen.getByTestId("body");
    expect(body.className).toContain("min-h-0");
    expect(body.className).toContain("flex-1");
    expect(body.className).toContain("overflow-y-auto");
    expect(screen.getByRole("dialog").querySelectorAll(".overflow-y-auto")).toHaveLength(1);
  });

  it("keeps the footer pinned with a divider", () => {
    renderDialog(
      <DialogContent>
        <DialogTitle>Footer</DialogTitle>
        <DialogFooter data-testid="footer">
          <button type="button">OK</button>
        </DialogFooter>
      </DialogContent>
    );
    expect(screen.getByTestId("footer").className).toContain("shrink-0");
    expect(screen.getByTestId("footer").className).toContain("border-t");
  });

  it("drops the divider when bordered is false", () => {
    renderDialog(
      <DialogContent>
        <DialogTitle>Bare</DialogTitle>
        <DialogFooter data-testid="footer" bordered={false}>
          <button type="button">OK</button>
        </DialogFooter>
      </DialogContent>
    );
    expect(screen.getByTestId("footer").className).not.toContain("border-t");
  });
});

describe("DialogContent hideClose", () => {
  it("omits the built-in close button", () => {
    renderDialog(
      <DialogContent hideClose>
        <DialogTitle>No close</DialogTitle>
      </DialogContent>
    );
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});

describe("DialogContent padding", () => {
  it("padded={false} emits no padding at any breakpoint", () => {
    renderDialog(
      <DialogContent padded={false}>
        <DialogTitle>Full bleed</DialogTitle>
      </DialogContent>
    );
    const className = screen.getByRole("dialog").className;
    // A callsite `p-0` could not do this: `sm:p-6` is a separate merge group.
    expect(className).not.toContain("sm:p-6");
    expect(className).not.toContain("px-4");
  });

  it("is padded by default", () => {
    renderDialog(
      <DialogContent>
        <DialogTitle>Padded</DialogTitle>
      </DialogContent>
    );
    expect(screen.getByRole("dialog").className).toContain("sm:p-6");
  });
});
