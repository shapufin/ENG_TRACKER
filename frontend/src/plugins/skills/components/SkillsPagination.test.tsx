import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SkillsPagination } from "./SkillsPagination";

describe("SkillsPagination", () => {
  it("renders nothing when there is only one page", () => {
    render(<SkillsPagination page={1} totalPages={1} onPageChange={vi.fn()} />);

    expect(screen.queryByText("Previous")).not.toBeInTheDocument();
    expect(screen.queryByText("Next")).not.toBeInTheDocument();
  });

  it("disables Previous on the first page and enables Next", () => {
    render(<SkillsPagination page={1} totalPages={3} onPageChange={vi.fn()} />);

    expect(screen.getByText("Previous").closest("button")).toBeDisabled();
    expect(screen.getByText("Next").closest("button")).not.toBeDisabled();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("disables Next on the last page and enables Previous", () => {
    render(<SkillsPagination page={3} totalPages={3} onPageChange={vi.fn()} />);

    expect(screen.getByText("Previous").closest("button")).not.toBeDisabled();
    expect(screen.getByText("Next").closest("button")).toBeDisabled();
  });

  it("calls onPageChange with the previous page number", () => {
    const onPageChange = vi.fn();
    render(<SkillsPagination page={2} totalPages={3} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByText("Previous"));

    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("calls onPageChange with the next page number", () => {
    const onPageChange = vi.fn();
    render(<SkillsPagination page={2} totalPages={3} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByText("Next"));

    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
