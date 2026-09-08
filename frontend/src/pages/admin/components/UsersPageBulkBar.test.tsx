import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UsersPageBulkBar } from "./UsersPageBulkBar";

describe("UsersPageBulkBar", () => {
  it("stays hidden when no users are selected", () => {
    render(<UsersPageBulkBar selectedCount={0} onClear={vi.fn()} onBulkActions={vi.fn()} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the selection count and bulk edit action", () => {
    const onClear = vi.fn();
    const onBulkActions = vi.fn();
    render(
      <UsersPageBulkBar
        selectedCount={2}
        onClear={onClear}
        onBulkActions={onBulkActions}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("2 users selected");
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    fireEvent.click(screen.getByRole("button", { name: "Bulk edit" }));
    expect(onClear).toHaveBeenCalledOnce();
    expect(onBulkActions).toHaveBeenCalledOnce();
  });
});
