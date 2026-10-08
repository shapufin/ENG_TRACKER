import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { toast } from "sonner";
import { ExportDashboardPdfButton } from "./ExportDashboardPdfButton";

const h = vi.hoisted(() => ({ factoryRuns: 0, capture: vi.fn() }));

vi.mock("@/components/visualization/pdfExport", () => {
  h.factoryRuns++;
  return { captureChartsToPdf: h.capture };
});
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, username: "root", full_name: "Root Admin" } }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));

const mount = (withSection: boolean) => {
  const ref = createRef<HTMLDivElement>();
  render(
    <>
      <div ref={ref}>
        {withSection ? <div data-chart-section="a">chart</div> : <div>skeleton</div>}
      </div>
      <ExportDashboardPdfButton containerRef={ref} />
    </>
  );
  return ref;
};

beforeEach(() => {
  h.capture.mockReset();
  h.capture.mockResolvedValue(undefined);
  vi.mocked(toast.info).mockReset();
  vi.mocked(toast.error).mockReset();
});

describe("ExportDashboardPdfButton", () => {
  it("does not load the pdf library until clicked", () => {
    mount(true);
    expect(h.factoryRuns).toBe(0);
  });

  it("captures the container with title, dated filename and the user's name", async () => {
    const ref = mount(true);
    fireEvent.click(screen.getByRole("button", { name: /export pdf/i }));
    await waitFor(() => expect(h.capture).toHaveBeenCalledTimes(1));
    const [container, opts] = h.capture.mock.calls[0];
    expect(container).toBe(ref.current);
    expect(opts.title).toBe("Admin Dashboard");
    expect(opts.filename).toMatch(/^admin-dashboard-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(opts.generatedBy).toBe("Root Admin");
  });

  it("is disabled and busy while exporting", async () => {
    let finish: () => void = () => {};
    h.capture.mockImplementation(() => new Promise<void>((r) => (finish = r)));
    mount(true);
    const button = screen.getByRole("button", { name: /export pdf/i });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("aria-busy", "true");
    finish();
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("tells the user when there is nothing to export instead of making a blank PDF", async () => {
    mount(false);
    fireEvent.click(screen.getByRole("button", { name: /export pdf/i }));
    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/nothing to export/i))
    );
    expect(h.capture).not.toHaveBeenCalled();
  });

  it("reports a failure and re-enables the button", async () => {
    h.capture.mockRejectedValue(new Error("boom"));
    mount(true);
    const button = screen.getByRole("button", { name: /export pdf/i });
    fireEvent.click(button);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
