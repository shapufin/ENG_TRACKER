import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SearchField } from "./SearchField";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

describe("SearchField", () => {
  it("is a labelled searchbox and adds no unlabelled search landmark", () => {
    render(<SearchField value="" onChange={() => {}} aria-label="Search people" />);
    expect(screen.queryByRole("search")).toBeNull();
    const box = screen.getByRole("searchbox", { name: "Search people" });
    expect(box).toHaveAttribute("autocomplete", "off");
    expect(box).toHaveAttribute("spellcheck", "false");
    expect(box).toHaveAttribute("enterkeyhint", "search");
  });

  it("calls onChange when typing", () => {
    const onChange = vi.fn();
    render(<SearchField value="" onChange={onChange} aria-label="s" />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bob" } });
    expect(onChange).toHaveBeenCalledWith("bob");
  });

  it("shows a focusable clear button only when non-empty", () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    const { rerender } = render(<SearchField value="" onChange={onChange} aria-label="s" />);
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    rerender(<SearchField value="x" onChange={onChange} onClear={onClear} aria-label="s" />);
    const btn = screen.getByRole("button", { name: "Clear search" });
    expect(btn).toHaveAttribute("type", "button");
    btn.focus();
    expect(btn).toHaveFocus();
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith("");
    expect(onClear).toHaveBeenCalled();
  });

  it("Escape clears", () => {
    const onChange = vi.fn();
    render(<SearchField value="abc" onChange={onChange} aria-label="s" />);
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("puts focus back in the field after Clear, since the button disappears", () => {
    const Harness = () => {
      const [v, setV] = React.useState("abc");
      return <SearchField value={v} onChange={setV} aria-label="s" />;
    };
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("searchbox")).toHaveFocus();
  });

  it("forwards disabled, name, inputMode and onKeyDown to the input", () => {
    const onKeyDown = vi.fn();
    render(
      <SearchField
        value=""
        onChange={() => {}}
        aria-label="s"
        disabled
        name="q"
        inputMode="search"
        onKeyDown={onKeyDown}
      />
    );
    const box = screen.getByRole("searchbox");
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute("name", "q");
    expect(box).toHaveAttribute("inputmode", "search");
    fireEvent.keyDown(box, { key: "a" });
    expect(onKeyDown).toHaveBeenCalled();
  });

  it("inside a Dialog the first Escape only clears the text; the second closes the dialog", () => {
    const Harness = () => {
      const [open, setOpen] = React.useState(true);
      const [v, setV] = React.useState("abc");
      return (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>Pick</DialogTitle>
            <DialogDescription>Search and pick one</DialogDescription>
            <SearchField value={v} onChange={setV} aria-label="s" />
          </DialogContent>
        </Dialog>
      );
    };
    render(<Harness />);
    const box = screen.getByRole("searchbox");
    box.focus();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("");
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
