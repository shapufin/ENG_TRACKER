import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImportSampleButton } from "./ImportSampleButton";

const downloadTemplate = vi.fn();

vi.mock("../services/dataImportService", () => ({
  dataImportService: {
    downloadTemplate: (...args: unknown[]) => downloadTemplate(...args),
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("ImportSampleButton", () => {
  beforeEach(() => {
    downloadTemplate.mockReset();
    downloadTemplate.mockResolvedValue(undefined);
  });

  it("offers both formats", () => {
    render(<ImportSampleButton targetKey="clients" />);
    expect(screen.getByRole("button", { name: /sample csv/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sample excel/i })).toBeInTheDocument();
  });

  it("downloads the CSV sample for its target", async () => {
    render(<ImportSampleButton targetKey="clients" />);
    fireEvent.click(screen.getByRole("button", { name: /sample csv/i }));
    await waitFor(() => expect(downloadTemplate).toHaveBeenCalledWith("clients", "csv"));
  });

  it("downloads the Excel sample for its target", async () => {
    render(<ImportSampleButton targetKey="user_skills" />);
    fireEvent.click(screen.getByRole("button", { name: /sample excel/i }));
    await waitFor(() => expect(downloadTemplate).toHaveBeenCalledWith("user_skills", "xlsx"));
  });

  it("surfaces a failed download instead of failing silently", async () => {
    const { toast } = await import("sonner");
    downloadTemplate.mockRejectedValue(new Error("nope"));
    render(<ImportSampleButton targetKey="clients" />);
    fireEvent.click(screen.getByRole("button", { name: /sample csv/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it("renders nothing without a target", () => {
    const { container } = render(<ImportSampleButton targetKey={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
