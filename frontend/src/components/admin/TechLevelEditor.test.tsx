import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TechLevelEditor } from "./TechLevelEditor";
import { userService } from "@/services/userService";
import type { Tech, TechLevel } from "@/types";

vi.mock("@/services/userService", () => ({
  userService: {
    createTechLevel: vi.fn(),
    updateTechLevel: vi.fn(),
    deleteTechLevel: vi.fn(),
    reorderTechLevels: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";

// ConfirmDialog is mocked so the delete path is reachable without driving a
// real dialog — TechLevelEditor owns the open state and the mutation wiring,
// which is what these tests cover.
vi.mock("@/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: ({
    open,
    description,
    onConfirm,
  }: {
    open: boolean;
    description?: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <div>
        <p>{description}</p>
        <button onClick={onConfirm}>Confirm delete</button>
      </div>
    ) : null,
}));

const level = (over: Partial<TechLevel> = {}): TechLevel => ({
  id: 1,
  tech: 7,
  name: "Level 1",
  code: "L1",
  rank: 1,
  is_active: true,
  ...over,
});

const tech = (levels: TechLevel[]): Tech => ({
  id: 7,
  name: "Infrastructure",
  code: "INFRA",
  is_active: true,
  levels,
});

const renderEditor = (target: Tech) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TechLevelEditor tech={target} />
    </QueryClientProvider>
  );

describe("TechLevelEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prompts to add a level when the scale is empty", () => {
    renderEditor(tech([]));
    expect(screen.getByText(/No levels yet/)).toBeInTheDocument();
    expect(screen.getByText(/grade people inside Infrastructure/)).toBeInTheDocument();
  });

  it("renders levels rank-ascending regardless of input order", () => {
    renderEditor(
      tech([
        level({ id: 3, name: "Level 3", code: "L3", rank: 3 }),
        level({ id: 1, name: "Level 1", code: "L1", rank: 1 }),
        level({ id: 2, name: "Level 2", code: "L2", rank: 2 }),
      ])
    );
    const codes = screen.getAllByText(/^L[123]$/).map((node) => node.textContent);
    expect(codes).toEqual(["L1", "L2", "L3"]);
  });

  it("appends a new level after the highest existing rank", async () => {
    vi.mocked(userService.createTechLevel).mockResolvedValue(level({ id: 9 }) as never);
    renderEditor(tech([level({ id: 1, rank: 1 }), level({ id: 2, code: "L2", name: "Level 2", rank: 5 })]));

    fireEvent.change(screen.getByLabelText("Level name"), { target: { value: "Level 6" } });
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "l6" } });
    fireEvent.click(screen.getByRole("button", { name: /Add level/ }));

    await waitFor(() => {
      expect(userService.createTechLevel).toHaveBeenCalledWith({
        tech: 7,
        name: "Level 6",
        code: "L6",
        rank: 6,
      });
    });
  });

  it("ranks the first level 1", async () => {
    vi.mocked(userService.createTechLevel).mockResolvedValue(level() as never);
    renderEditor(tech([]));

    fireEvent.change(screen.getByLabelText("Level name"), { target: { value: "Junior" } });
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "JR" } });
    fireEvent.click(screen.getByRole("button", { name: /Add level/ }));

    await waitFor(() => {
      expect(userService.createTechLevel).toHaveBeenCalledWith(
        expect.objectContaining({ rank: 1 })
      );
    });
  });

  it("disables Add until both name and code are filled", () => {
    renderEditor(tech([]));
    const add = screen.getByRole("button", { name: /Add level/ });
    expect(add).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Level name"), { target: { value: "Junior" } });
    expect(add).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "JR" } });
    expect(add).toBeEnabled();
  });

  it("posts the whole new order when moving a level down", async () => {
    vi.mocked(userService.reorderTechLevels).mockResolvedValue({ reordered: 3 } as never);
    renderEditor(
      tech([
        level({ id: 1, code: "L1", name: "Level 1", rank: 1 }),
        level({ id: 2, code: "L2", name: "Level 2", rank: 2 }),
        level({ id: 3, code: "L3", name: "Level 3", rank: 3 }),
      ])
    );

    fireEvent.click(screen.getByRole("button", { name: "Move Level 1 down" }));

    await waitFor(() => {
      expect(userService.reorderTechLevels).toHaveBeenCalledWith(7, [2, 1, 3]);
    });
  });

  it("posts the whole new order when moving a level up", async () => {
    vi.mocked(userService.reorderTechLevels).mockResolvedValue({ reordered: 3 } as never);
    renderEditor(
      tech([
        level({ id: 1, code: "L1", name: "Level 1", rank: 1 }),
        level({ id: 2, code: "L2", name: "Level 2", rank: 2 }),
        level({ id: 3, code: "L3", name: "Level 3", rank: 3 }),
      ])
    );

    fireEvent.click(screen.getByRole("button", { name: "Move Level 3 up" }));

    await waitFor(() => {
      expect(userService.reorderTechLevels).toHaveBeenCalledWith(7, [1, 3, 2]);
    });
  });

  it("cannot move the first level up or the last level down", () => {
    renderEditor(
      tech([
        level({ id: 1, code: "L1", name: "Level 1", rank: 1 }),
        level({ id: 2, code: "L2", name: "Level 2", rank: 2 }),
      ])
    );

    expect(screen.getByRole("button", { name: "Move Level 1 up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Level 2 down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Level 1 down" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Move Level 2 up" })).toBeEnabled();
  });

  it("toggles an active level to inactive", async () => {
    vi.mocked(userService.updateTechLevel).mockResolvedValue(level() as never);
    renderEditor(tech([level({ id: 4, is_active: true })]));

    fireEvent.click(screen.getByRole("button", { name: "Deactivate Level 1" }));

    await waitFor(() => {
      expect(userService.updateTechLevel).toHaveBeenCalledWith(4, { is_active: false });
    });
  });

  it("marks an inactive level and offers to reactivate it", async () => {
    vi.mocked(userService.updateTechLevel).mockResolvedValue(level() as never);
    renderEditor(tech([level({ id: 4, is_active: false })]));

    expect(screen.getByText("Inactive")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Activate Level 1" }));

    await waitFor(() => {
      expect(userService.updateTechLevel).toHaveBeenCalledWith(4, { is_active: true });
    });
  });

  it("warns that deleting a level leaves people ungraded, then deletes", async () => {
    vi.mocked(userService.deleteTechLevel).mockResolvedValue(undefined as never);
    renderEditor(tech([level({ id: 4 })]));

    fireEvent.click(screen.getByRole("button", { name: "Delete Level 1" }));
    expect(
      screen.getByText(/keep their Infrastructure assignment but become ungraded/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => {
      expect(userService.deleteTechLevel).toHaveBeenCalledWith(4);
    });
  });

  it("surfaces a duplicate-code failure as an error toast", async () => {
    vi.mocked(userService.createTechLevel).mockRejectedValue(new Error("400") as never);
    renderEditor(tech([]));

    fireEvent.change(screen.getByLabelText("Level name"), { target: { value: "Level 1" } });
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "L1" } });
    fireEvent.click(screen.getByRole("button", { name: /Add level/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("duplicate name or code")
      );
    });
  });

  it("surfaces a failed reorder as an error toast", async () => {
    vi.mocked(userService.reorderTechLevels).mockRejectedValue(new Error("400") as never);
    renderEditor(
      tech([
        level({ id: 1, code: "L1", name: "Level 1", rank: 1 }),
        level({ id: 2, code: "L2", name: "Level 2", rank: 2 }),
      ])
    );

    fireEvent.click(screen.getByRole("button", { name: "Move Level 1 down" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to reorder levels.");
    });
  });

  it("renames a level when only the code changes", async () => {
    vi.mocked(userService.updateTechLevel).mockResolvedValue(level() as never);
    renderEditor(tech([level()]));
    fireEvent.click(screen.getByLabelText("Rename Level 1"));
    fireEvent.change(screen.getByLabelText("Code for L1"), {
      target: { value: "lv1" },
    });
    fireEvent.click(screen.getByLabelText("Save rename for Level 1"));
    await waitFor(() => {
      expect(userService.updateTechLevel).toHaveBeenCalledWith(1, {
        name: "Level 1",
        code: "LV1",
      });
    });
  });

  it("keeps save disabled while the rename is unchanged", () => {
    renderEditor(tech([level()]));
    fireEvent.click(screen.getByLabelText("Rename Level 1"));
    expect(screen.getByLabelText("Save rename for Level 1")).toBeDisabled();
  });
});
