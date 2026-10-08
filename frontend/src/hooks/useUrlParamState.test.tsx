import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useUrlParamState } from "./useUrlParamState";

const STATUSES = ["all", "pending", "approved"] as const;

const Probe = () => {
  const [value, setValue] = useUrlParamState("status", STATUSES, "all");
  const loc = useLocation();
  return (
    <div>
      <span data-testid="value">{value}</span>
      <span data-testid="search">{loc.search}</span>
      <button onClick={() => setValue("pending")}>pending</button>
      <button onClick={() => setValue("all")}>all</button>
    </div>
  );
};

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Probe />
    </MemoryRouter>
  );

describe("useUrlParamState", () => {
  it("reads a valid value", () => {
    renderAt("/x?status=pending");
    expect(screen.getByTestId("value")).toHaveTextContent("pending");
  });

  it("falls back for a bogus or missing value", () => {
    const { unmount } = renderAt("/x?status=bogus");
    expect(screen.getByTestId("value")).toHaveTextContent("all");
    unmount();
    renderAt("/x");
    expect(screen.getByTestId("value")).toHaveTextContent("all");
  });

  it("writes the param and keeps other params", () => {
    renderAt("/x?foo=1");
    fireEvent.click(screen.getByText("pending"));
    expect(screen.getByTestId("value")).toHaveTextContent("pending");
    const search = screen.getByTestId("search").textContent ?? "";
    expect(search).toContain("status=pending");
    expect(search).toContain("foo=1");
  });

  it("removes the param when set back to the fallback", () => {
    renderAt("/x?status=pending&foo=1");
    fireEvent.click(screen.getByText("all"));
    const search = screen.getByTestId("search").textContent ?? "";
    expect(search).not.toContain("status");
    expect(search).toContain("foo=1");
  });
});
