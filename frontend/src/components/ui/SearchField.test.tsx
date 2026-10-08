import { describe, it, expect, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SearchField } from "./SearchField";

afterEach(() => vi.useRealTimers());

describe("SearchField", () => {
  it("is a labelled search landmark with a searchbox", () => {
    render(<SearchField value="" onChange={() => {}} aria-label="Search people" />);
    expect(screen.getByRole("search")).toBeInTheDocument();
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

  it("hides the shortcut hint when there is a value and shows a spinner when loading", () => {
    const { rerender } = render(
      <SearchField value="" onChange={() => {}} aria-label="s" shortcut="/" />
    );
    expect(screen.getByText("/")).toBeInTheDocument();
    rerender(<SearchField value="a" onChange={() => {}} aria-label="s" shortcut="/" />);
    expect(screen.queryByText("/")).toBeNull();
    rerender(<SearchField value="" onChange={() => {}} aria-label="s" loading />);
    expect(screen.getByRole("search")).toHaveAttribute("aria-busy", "true");
  });

  it("debounces onChange when debounceMs is set", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<SearchField value="" onChange={onChange} aria-label="s" debounceMs={200} />);
    const box = screen.getByRole("searchbox");
    fireEvent.change(box, { target: { value: "a" } });
    fireEvent.change(box, { target: { value: "ab" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(box).toHaveValue("ab");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("ab");
  });
});
