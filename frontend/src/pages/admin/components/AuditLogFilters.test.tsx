import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuditLogFilters } from "./AuditLogFilters";

const props = {
  filterAction: "all",
  onFilterActionChange: vi.fn(),
  filterModel: "all",
  onFilterModelChange: vi.fn(),
  searchQuery: "",
  onSearchQueryChange: vi.fn(),
};

describe("AuditLogFilters", () => {
  it("associates every label with its control via the shared primitives", () => {
    render(<AuditLogFilters {...props} />);
    // Shared Select triggers expose their Label text as accessible name.
    expect(screen.getByRole("combobox", { name: "Action" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search by user or object...")).toHaveClass("bg-input-bg");
  });
});
