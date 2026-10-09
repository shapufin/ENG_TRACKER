import { describe, it, expect, vi } from "vitest";
import html2canvas from "html2canvas-pro";
import { captureChartsToPdf, expandScrollRegions, hiddenScrollExtent } from "./pdfExport";

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

  it("prints a provenance footer with generatedBy and periodLabel", async () => {
    text.mockClear();
    await captureChartsToPdf(makeContainer(1), {
      title: "Report",
      filename: "report.pdf",
      generatedBy: "Enri Demnushi",
      periodLabel: "March 2026",
    });

    const footerCall = text.mock.calls.find(([textArg]) => String(textArg).includes("Generated"));
    expect(footerCall).toBeDefined();
    expect(footerCall![0]).toContain("by Enri Demnushi");
    expect(footerCall![0]).toContain("Data as of March 2026");
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

const scrollingCard = () => {
  const section = document.createElement("div");
  section.setAttribute("data-chart-section", "card");
  section.style.height = "200px";
  section.style.overflow = "hidden";
  const body = document.createElement("div");
  body.style.overflowY = "auto";
  body.style.height = "150px";
  body.style.maxHeight = "150px";
  section.appendChild(body);
  document.body.appendChild(section);
  // jsdom does no layout: stand in for a 600px list inside a 150px body.
  Object.defineProperty(body, "scrollHeight", { configurable: true, value: 600 });
  Object.defineProperty(body, "clientHeight", { configurable: true, value: 150 });
  return { section, body };
};

describe("scrolling card bodies in the capture", () => {
  it("measures how much a section hides behind its scroll regions", () => {
    const { section } = scrollingCard();
    expect(hiddenScrollExtent(section)).toBe(450);
    expect(hiddenScrollExtent(makeContainer(1))).toBe(0);
  });

  it("onclone expands the section and its scroll regions so nothing is clipped", () => {
    const { section, body } = scrollingCard();
    expandScrollRegions(section);
    expect(section.style.height).toBe("auto");
    expect(section.style.overflow).toBe("hidden"); // rounded corners keep clipping
    expect(body.style.overflow).toBe("visible");
    expect(body.style.height).toBe("auto");
    expect(body.style.maxHeight).toBe("none");
  });

  it("hands html2canvas the onclone hook and room for the hidden rows", async () => {
    const { section } = scrollingCard();
    section.getBoundingClientRect = () => ({ height: 200 }) as DOMRect;
    const container = document.createElement("div");
    container.appendChild(section);
    const mockedCapture = vi.mocked(html2canvas);
    mockedCapture.mockClear();
    await captureChartsToPdf(container, { title: "t", filename: "f.pdf" });
    const options = mockedCapture.mock.calls[0][1] as {
      onclone: (d: Document, el: HTMLElement) => void;
      height: number;
    };
    expect(options.height).toBe(650);
    options.onclone(document, section);
    expect(section.style.height).toBe("auto");
  });
});
