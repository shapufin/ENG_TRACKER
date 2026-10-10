import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DataTableActions } from "./DataTableActions";

describe("DataTableActions", () => {
  it("labels each row action with the row name and routes clicks to the handlers", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const item = { id: 3, name: "DOME_TEAM" };
    render(
      <DataTableActions item={item} itemLabel="DOME_TEAM" onEdit={onEdit} onDelete={onDelete} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit DOME_TEAM" }));
    expect(onEdit).toHaveBeenCalledWith(item);

    fireEvent.click(screen.getByRole("button", { name: "Delete DOME_TEAM" }));
    expect(onDelete).toHaveBeenCalledWith(item);
  });

  it("omits delete when no delete handler is given", () => {
    render(<DataTableActions item={{ id: 1 }} itemLabel="Ops" onEdit={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
  });
});
