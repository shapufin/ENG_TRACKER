import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { CRViewTabs } from "./CRViewTabs";

// Mock shadcn Tabs so jsdom doesn't choke on radix pointer events.
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ value, onValueChange, children }: any) => (
    <div data-testid="tabs" data-value={value}>
      {React.Children.map(children, (c: any) =>
        React.cloneElement(c, { _value: value, _onChange: onValueChange })
      )}
    </div>
  ),
  TabsList: ({ children, _value, _onChange, ...rest }: any) => (
    <div data-testid="tabs-list" role="tablist" {...rest}>
      {React.Children.map(children, (c: any) => React.cloneElement(c, { _value, _onChange }))}
    </div>
  ),
  TabsTrigger: ({ value, children, _value: active, _onChange, ...rest }: any) => (
    <button
      role="tab"
      data-state={active === value ? "active" : "inactive"}
      onClick={() => _onChange?.(value)}
      {...rest}
    >
      {children}
    </button>
  ),
}));

describe("CRViewTabs", () => {
  it("renders 4 view mode triggers (this-week + roster + by-team + by-day)", () => {
    render(<CRViewTabs value="roster" onChange={vi.fn()} />);
    expect(screen.getByRole("tab", { name: /This Week/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /By Team/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /By Day/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Roster/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Overview/i })).not.toBeInTheDocument();
  });

  it("marks the active tab as active", () => {
    render(<CRViewTabs value="by-day" onChange={vi.fn()} />);
    expect(screen.getByRole("tab", { name: /By Day/i })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: /Roster/i })).toHaveAttribute("data-state", "inactive");
  });

  it("calls onChange with the new mode when a tab is clicked", () => {
    const onChange = vi.fn();
    render(<CRViewTabs value="roster" onChange={onChange} />);
    screen.getByRole("tab", { name: /By Team/i }).click();
    expect(onChange).toHaveBeenCalledWith("by-team");
  });

  it("calls onChange with 'this-week' when the This Week tab is clicked", () => {
    const onChange = vi.fn();
    render(<CRViewTabs value="roster" onChange={onChange} />);
    screen.getByRole("tab", { name: /This Week/i }).click();
    expect(onChange).toHaveBeenCalledWith("this-week");
  });
});
