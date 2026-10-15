import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GeneratedPasswordField } from "./GeneratedPasswordField";

afterEach(() => vi.unstubAllGlobals());

describe("GeneratedPasswordField", () => {
  it("is masked until revealed", () => {
    render(<GeneratedPasswordField value="abc" onChange={vi.fn()} />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
  });

  it("Generate fills a strong password and reveals it so it can be read", () => {
    const onChange = vi.fn();
    render(<GeneratedPasswordField value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate password" }));
    expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^[A-Za-z0-9]{16}$/));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
  });

  it("Copy writes the current value to the clipboard", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<GeneratedPasswordField value="Secret123" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy password" }));
    expect(writeText).toHaveBeenCalledWith("Secret123");
  });

  it("disables Copy when empty and shows the server error", () => {
    render(<GeneratedPasswordField value="" onChange={vi.fn()} error="Too short." />);
    expect(screen.getByRole("button", { name: "Copy password" })).toBeDisabled();
    expect(screen.getByText("Too short.")).toBeInTheDocument();
  });
});
