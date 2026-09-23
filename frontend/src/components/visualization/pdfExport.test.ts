import { describe, it, expect, vi } from "vitest";
import html2canvas from "html2canvas-pro";
import { captureChartsToPdf } from "./pdfExport";

const addImage = vi.fn();
const addPage = vi.fn();
const text = vi.fn();
const setFontSize = vi.fn();
const setTextColor = vi.fn();
const save = vi.fn();

vi.mock("jspdf", () => ({
  jsPDF: class {
    internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } };
    addImage = addImage;
    addPage = addPage;
    text = text;
    setFontSize = setFontSize;
    setTextColor = setTextColor;
    save = save;
  },
}));

vi.mock("html2canvas-pro", () => ({
  default: vi.fn().mockResolvedValue({
    width: 1200,
    height: 3000, // taller than a page at full width, to exercise the scale-to-fit path
    toDataURL: () => "data:image/png;base64,fake",
  }),
}));

const makeContainer = (sectionCount: number) => {
  const container = document.createElement("div");
  for (let i = 0; i < sectionCount; i++) {
    const section = document.createElement("div");
    section.setAttribute("data-chart-section", `s${i}`);
    container.appendChild(section);
  }
  return container;
};

describe("captureChartsToPdf", () => {
  it("does nothing when there are no chart sections", async () => {
    await captureChartsToPdf(makeContainer(0), { title: "t", filename: "f.pdf" });
    expect(save).not.toHaveBeenCalled();
  });

  it("adds one image per section, a new page for each after the first, and saves", async () => {
    await captureChartsToPdf(makeContainer(3), { title: "Report", filename: "report.pdf" });

    expect(addImage).toHaveBeenCalledTimes(3);
    expect(addPage).toHaveBeenCalledTimes(2); // not called before the first section
    expect(save).toHaveBeenCalledWith("report.pdf");
  });

  it("scales a tall section down proportionally instead of stretching it", async () => {
    await captureChartsToPdf(makeContainer(1), { title: "t", filename: "f.pdf" });

    const [, , , , drawWidth, drawHeight] = addImage.mock.calls[0];
    // source aspect ratio: 1200 / 3000 = 0.4
    expect(drawWidth / drawHeight).toBeCloseTo(1200 / 3000, 5);
  });

  it("skips zero-area sections and saves nothing when none render", async () => {
    const mockedCapture = vi.mocked(html2canvas);
    mockedCapture.mockResolvedValueOnce({
      width: 0,
      height: 0,
      toDataURL: () => "",
    } as unknown as HTMLCanvasElement);

    const imagesBefore = addImage.mock.calls.length;
    const pagesBefore = addPage.mock.calls.length;
    const savesBefore = save.mock.calls.length;

    // First section renders 0x0 (skipped), the other two render normally.
    await captureChartsToPdf(makeContainer(3), { title: "t", filename: "f.pdf" });

    expect(addImage.mock.calls.length - imagesBefore).toBe(2);
    expect(addPage.mock.calls.length - pagesBefore).toBe(1);
    expect(save.mock.calls.length - savesBefore).toBe(1);

    mockedCapture.mockResolvedValueOnce({
      width: 0,
      height: 0,
      toDataURL: () => "",
    } as unknown as HTMLCanvasElement);
    const savesBefore2 = save.mock.calls.length;
    await captureChartsToPdf(makeContainer(1), { title: "t", filename: "f.pdf" });
    expect(save.mock.calls.length - savesBefore2).toBe(0);
  });
});
