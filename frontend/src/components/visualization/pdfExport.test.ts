import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import html2canvas from "html2canvas-pro";
import {
  captureChartsToPdf,
  expandScrollRegions,
  hiddenScrollExtent,
  isSectionFullWidth,
  applyPrintStyles,
  extractChartVectors,
} from "./pdfExport";

const addImage = vi.fn();
const addPage = vi.fn();
const text = vi.fn();
const setFontSize = vi.fn();
const setTextColor = vi.fn();
const setDrawColor = vi.fn();
const setLineWidth = vi.fn();
const setFillColor = vi.fn();
const rect = vi.fn();
const roundedRect = vi.fn();
const line = vi.fn();
const setPage = vi.fn();
const save = vi.fn();
const svg = vi.fn();
let pageCount = 1;

// svg2pdf.js needs a real browser DOM (it does not run under JSDOM); `pdf.svg` is mocked below.
vi.mock("svg2pdf.js", () => ({}));

vi.mock("jspdf", () => ({
  jsPDF: class {
    internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } };
    addImage = addImage;
    addPage = vi.fn().mockImplementation(() => {
      pageCount++;
      addPage();
    });
    text = text;
    setFontSize = setFontSize;
    setTextColor = setTextColor;
    setDrawColor = setDrawColor;
    setLineWidth = setLineWidth;
    setFillColor = setFillColor;
    rect = rect;
    roundedRect = roundedRect;
    line = line;
    setPage = setPage;
    getNumberOfPages = vi.fn().mockImplementation(() => pageCount);
    save = save;
    svg = svg;
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
  beforeEach(() => {
    pageCount = 1;
    addImage.mockClear();
    addPage.mockClear();
    text.mockClear();
    setFontSize.mockClear();
    setTextColor.mockClear();
    setDrawColor.mockClear();
    setLineWidth.mockClear();
    setFillColor.mockClear();
    rect.mockClear();
    roundedRect.mockClear();
    line.mockClear();
    setPage.mockClear();
    save.mockClear();
    vi.mocked(html2canvas).mockResolvedValue({
      width: 1200,
      height: 3000,
      toDataURL: () => "data:image/png;base64,fake",
    } as unknown as HTMLCanvasElement);
  });

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

  it("bundles multiple compact sections onto the same page without adding unnecessary pages", async () => {
    const mockedCapture = vi.mocked(html2canvas);
    // 3 sections, each only 300px high (scaled height ~130pt, so all 3 easily fit on 1 page)
    mockedCapture.mockResolvedValue({
      width: 1200,
      height: 300,
      toDataURL: () => "data:image/png;base64,fake",
    } as unknown as HTMLCanvasElement);

    await captureChartsToPdf(makeContainer(3), {
      title: "Bundled Report",
      filename: "bundled.pdf",
    });

    expect(addImage).toHaveBeenCalledTimes(3);
    expect(addPage).not.toHaveBeenCalled(); // All 3 fit on page 1!
    expect(save).toHaveBeenCalledWith("bundled.pdf");
  });

  it("renders document header on page 1, running headers on subsequent pages, and footers with page numbers", async () => {
    await captureChartsToPdf(makeContainer(2), {
      title: "Scorecard Visual",
      filename: "scorecard.pdf",
      periodLabel: "Q3 2026",
    });

    expect(setPage).toHaveBeenCalledWith(1);
    expect(setPage).toHaveBeenCalledWith(2);

    // Verify footer page numbering
    const page1Footer = text.mock.calls.find(([arg]) => String(arg) === "Page 1 of 2");
    const page2Footer = text.mock.calls.find(([arg]) => String(arg) === "Page 2 of 2");
    expect(page1Footer).toBeDefined();
    expect(page2Footer).toBeDefined();

    // Verify running header period label
    const periodCall = text.mock.calls.find(([arg]) => String(arg) === "Q3 2026");
    expect(periodCall).toBeDefined();

    // Verify divider lines were drawn (headers and footers on both pages)
    expect(line).toHaveBeenCalled();
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

  it("pairs consecutive half-width sections side-by-side in a 2-column row", async () => {
    const container = document.createElement("div");
    const s1 = document.createElement("div");
    s1.setAttribute("data-chart-section", "s1");
    s1.setAttribute("data-pdf-span", "half");
    const s2 = document.createElement("div");
    s2.setAttribute("data-chart-section", "s2");
    s2.setAttribute("data-pdf-span", "half");
    container.appendChild(s1);
    container.appendChild(s2);

    const mockedCapture = vi.mocked(html2canvas);
    mockedCapture.mockResolvedValue({
      width: 600,
      height: 400,
      toDataURL: () => "data:image/png;base64,fake",
    } as unknown as HTMLCanvasElement);

    await captureChartsToPdf(container, { title: "Dual Column", filename: "dual.pdf" });

    expect(addImage).toHaveBeenCalledTimes(2);
    // Left card at margin x=32
    expect(addImage.mock.calls[0][2]).toBe(32);
    // Right card at col2 x=304.5 (margin + colWidth + GAP = 32 + 258.5 + 14)
    expect(addImage.mock.calls[1][2]).toBe(304.5);
    // Both cards share the same Y coordinate on the same row!
    expect(addImage.mock.calls[0][3]).toBe(addImage.mock.calls[1][3]);
    // Both fit on page 1
    expect(addPage).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith("dual.pdf");
  });

  it("draws the executive masthead, accent line, and structured metadata card on page 1", async () => {
    await captureChartsToPdf(makeContainer(1), {
      title: "Executive Report",
      filename: "exec.pdf",
      generatedBy: "Senior Lead",
      periodLabel: "October 2026",
    });

    // Check accent line and metadata panel
    expect(rect).toHaveBeenCalled();
    // Check eyebrow tag
    const eyebrow = text.mock.calls.find(([t]) =>
      String(t).includes("EXECUTIVE OPERATIONS REPORT")
    );
    expect(eyebrow).toBeDefined();

    // Check classification
    const classification = text.mock.calls.find(([t]) => String(t).includes("CONFIDENTIAL"));
    expect(classification).toBeDefined();
  });
});

describe("isSectionFullWidth", () => {
  it("honors explicit data-pdf-span attribute", () => {
    const container = document.createElement("div");
    const fullEl = document.createElement("div");
    fullEl.setAttribute("data-pdf-span", "full");
    const halfEl = document.createElement("div");
    halfEl.setAttribute("data-pdf-span", "half");

    expect(isSectionFullWidth(fullEl, container)).toBe(true);
    expect(isSectionFullWidth(halfEl, container)).toBe(false);
  });

  it("detects width ratio when container and section have dimensions", () => {
    const container = document.createElement("div");
    const wideEl = document.createElement("div");
    const narrowEl = document.createElement("div");

    container.getBoundingClientRect = () => ({ width: 1000 }) as DOMRect;
    wideEl.getBoundingClientRect = () => ({ width: 800 }) as DOMRect;
    narrowEl.getBoundingClientRect = () => ({ width: 450 }) as DOMRect;

    expect(isSectionFullWidth(wideEl, container)).toBe(true);
    expect(isSectionFullWidth(narrowEl, container)).toBe(false);
  });
});

describe("applyPrintStyles", () => {
  it("sets print background and hides export/edit action buttons", () => {
    const clone = document.createElement("div");
    const btn = document.createElement("button");
    btn.innerText = "Export PDF";
    const editBtn = document.createElement("button");
    editBtn.innerText = "Edit layout";
    const keepBtn = document.createElement("span");
    keepBtn.innerText = "Active Badge";
    clone.appendChild(btn);
    clone.appendChild(editBtn);
    clone.appendChild(keepBtn);

    applyPrintStyles(clone);

    expect(clone.style.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(btn.style.display).toBe("none");
    expect(editBtn.style.display).toBe("none");
    expect(keepBtn.style.display).not.toBe("none");
  });

  it("strips dark mode without overriding light chart tokens and renders solid hero text", () => {
    document.documentElement.classList.add("dark");
    try {
      const container = document.createElement("div");
      const hero = document.createElement("span");
      hero.setAttribute("data-pdf-solid-text", "true");
      hero.className = "bg-clip-text text-transparent";
      hero.textContent = "93";
      container.appendChild(hero);

      applyPrintStyles(container);

      expect(document.documentElement.classList.contains("dark")).toBe(false);
      expect(document.documentElement.style.getPropertyValue("--chart-2")).toBe("");
      expect(container.style.getPropertyValue("--chart-2")).toBe("");
      expect(container.style.backgroundColor).toMatch(/rgb\(255, 255, 255\)|#ffffff/);
      expect(hero.style.backgroundImage).toBe("none");
      expect(hero.style.color).toMatch(/rgb\(15, 23, 42\)|#0f172a/);
    } finally {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "";
    }
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

const domRect = (x: number, y: number, width: number, height: number) =>
  ({ x, y, left: x, top: y, width, height, right: x + width, bottom: y + height }) as DOMRect;

/** A section with one Recharts chart drawn at (10, 20), 300 x 200 CSS px inside it. */
const makeChartSection = () => {
  const section = document.createElement("div");
  section.setAttribute("data-chart-section", "chart");
  const wrapper = document.createElement("div");
  wrapper.className = "recharts-wrapper";
  wrapper.innerHTML =
    '<svg class="recharts-surface" width="300" height="200" viewBox="0 0 300 200">' +
    '<line stroke="hsl(var(--border))" x1="0" y1="0" x2="10" y2="0"></line>' +
    '<path fill="url(#trendFill)" d="M0 0L10 10"></path>' +
    '<text fill="hsl(var(--muted-foreground))">Jun</text></svg>';
  section.appendChild(wrapper);
  // A lucide icon is an <svg> too, but not a chart.
  section.insertAdjacentHTML("beforeend", '<svg class="lucide" width="16" height="16"></svg>');
  document.body.appendChild(section);
  vi.spyOn(section, "getBoundingClientRect").mockReturnValue(domRect(100, 50, 600, 400));
  const chart = section.querySelector<SVGSVGElement>("svg.recharts-surface")!;
  vi.spyOn(chart, "getBoundingClientRect").mockReturnValue(domRect(110, 70, 300, 200));
  return { section, chart };
};

describe("vector charts", () => {
  // Spies on window/prototype methods must not stack across tests.
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    document.body.innerHTML = "";
    svg.mockReset();
    addImage.mockClear();
    rect.mockClear();
  });

  it("finds only Recharts chart SVGs and measures them against their section", () => {
    const { section } = makeChartSection();
    const vectors = extractChartVectors(section);
    expect(vectors).toHaveLength(1);
    expect(vectors[0]).toMatchObject({ x: 10, y: 20, width: 300, height: 200 });
  });

  it("leaves a decorative chart (inside aria-hidden) in the section image", () => {
    // The engagement score card draws a faded wave behind its number: covering it with a
    // white box would erase the number, and its opacity lives on the aria-hidden wrapper.
    const { section } = makeChartSection();
    const backdrop = document.createElement("div");
    backdrop.setAttribute("aria-hidden", "true");
    backdrop.appendChild(section.querySelector(".recharts-wrapper")!);
    section.appendChild(backdrop);
    expect(extractChartVectors(section)).toEqual([]);
  });

  it("still finds the charts while a modal hides the app shell (aria-hidden outside the section)", () => {
    // An open Radix dialog (the two-factor prompt) marks the rest of the app aria-hidden.
    const { section } = makeChartSection();
    const shell = document.createElement("div");
    shell.setAttribute("aria-hidden", "true");
    document.body.appendChild(shell);
    shell.appendChild(section);
    expect(extractChartVectors(section)).toHaveLength(1);
  });

  it("writes the resolved print colours onto a copy, leaving the live chart alone", () => {
    const { section, chart } = makeChartSection();
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
      const style = real(el);
      if (el.tagName.toLowerCase() === "line") {
        return {
          ...style,
          getPropertyValue: (p: string) => (p === "stroke" ? "rgb(203, 213, 225)" : ""),
        } as CSSStyleDeclaration;
      }
      if (el.tagName.toLowerCase() === "text") {
        return {
          ...style,
          getPropertyValue: (p: string) => (p === "fill" ? "rgb(83, 89, 101)" : ""),
        } as CSSStyleDeclaration;
      }
      if (el.tagName.toLowerCase() === "path") {
        // A computed gradient reference is an absolute URL svg2pdf cannot follow.
        return {
          ...style,
          getPropertyValue: (p: string) => (p === "fill" ? 'url("http://x/page#trendFill")' : ""),
        } as CSSStyleDeclaration;
      }
      return style;
    });

    const [vector] = extractChartVectors(section);
    expect(vector.markup).toContain('stroke="rgb(203, 213, 225)"');
    expect(vector.markup).toContain('fill="rgb(83, 89, 101)"');
    expect(vector.markup).not.toContain("var(--");
    // Text is drawn with a font jsPDF ships with.
    expect(vector.markup).toContain('font-family="helvetica"');
    expect(vector.markup).toContain('fill="url(#trendFill)"');
    expect(chart.querySelector("line")!.getAttribute("stroke")).toBe("hsl(var(--border))");
    // Hidden in the print clone, so the section image keeps the space and the legend but not the plot.
    expect(chart.style.visibility).toBe("hidden");
  });

  it("blends each gradient stop onto white, since svg2pdf averages stop opacity over the gradient", () => {
    const { section } = makeChartSection();
    section
      .querySelector("svg.recharts-surface")!
      .insertAdjacentHTML(
        "afterbegin",
        '<defs><linearGradient id="g"><stop offset="0%"></stop><stop offset="100%"></stop></linearGradient></defs>'
      );
    const stops = section.querySelectorAll("stop");
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
      const values: Record<string, string> =
        el === stops[0]
          ? { "stop-color": "rgb(59, 130, 246)", "stop-opacity": "0.5" }
          : el === stops[1]
            ? { "stop-color": "rgba(59, 130, 246, 0.5)", "stop-opacity": "0" }
            : {};
      return {
        ...real(el),
        getPropertyValue: (p: string) => values[p] ?? "",
      } as CSSStyleDeclaration;
    });

    const copy = new DOMParser().parseFromString(
      extractChartVectors(section)[0].markup,
      "image/svg+xml"
    );
    const [first, last] = Array.from(copy.querySelectorAll("stop"));
    // 59 + (255 - 59) * 0.5 = 157, 130 -> 192.5 -> 193, 246 -> 250.5 -> 251
    expect(first.getAttribute("stop-color")).toBe("rgb(157, 193, 251)");
    expect(first.getAttribute("stop-opacity")).toBe("1");
    // Colour alpha multiplies stop-opacity: fully transparent is plain white.
    expect(last.getAttribute("stop-color")).toBe("rgb(255, 255, 255)");
    expect(last.getAttribute("stop-opacity")).toBe("1");
  });

  it("gives the copy its own ids, so url(#id) never resolves to the live chart's gradient", () => {
    // svg2pdf looks ids up in the document, where the live chart (same ids) comes first.
    const { section } = makeChartSection();
    section
      .querySelector("svg.recharts-surface")!
      .insertAdjacentHTML(
        "afterbegin",
        '<defs><linearGradient id="fade"></linearGradient><clipPath id="plot"><rect></rect></clipPath></defs>' +
          '<path fill="url(#fade)" clip-path="url(#plot)"></path><use href="#plot"></use>'
      );

    const copy = new DOMParser().parseFromString(
      extractChartVectors(section)[0].markup,
      "image/svg+xml"
    );
    const gradientId = copy.querySelector("linearGradient")!.id;
    const clipId = copy.querySelector("clipPath")!.id;
    expect(gradientId).not.toBe("fade");
    expect(clipId).not.toBe("plot");
    const path = copy.querySelector("path[clip-path]")!;
    expect(path.getAttribute("fill")).toBe(`url(#${gradientId})`);
    expect(path.getAttribute("clip-path")).toBe(`url(#${clipId})`);
    expect(copy.querySelector("use")!.getAttribute("href")).toBe(`#${clipId}`);
    // Two exports never share ids either.
    const again = new DOMParser().parseFromString(
      extractChartVectors(section)[0].markup,
      "image/svg+xml"
    );
    expect(again.querySelector("linearGradient")!.id).not.toBe(gradientId);
  });

  it("drops inline styles from the copy, so html2canvas's inlined computed style cannot override the paint", () => {
    // The html2canvas clone inlines every computed property; svg2pdf lets inline style win,
    // which brought back the fading stop opacity and the absolute url() fill.
    const { section } = makeChartSection();
    section
      .querySelector("line")!
      .setAttribute("style", "stroke: url(http://x/#a); stop-opacity: 0.45");
    const copy = new DOMParser().parseFromString(
      extractChartVectors(section)[0].markup,
      "image/svg+xml"
    );
    expect(copy.querySelectorAll("[style]")).toHaveLength(0);
  });

  it("reads paint after dropping inline styles, so a dark-mode export prints the light theme", () => {
    // html2canvas inlines the live page's computed style (dark mode) on the clone's SVG nodes;
    // the print theme only cascades once those inline values are gone.
    const { section } = makeChartSection();
    section.querySelector("line")!.setAttribute("style", "stroke: rgb(1, 2, 3)");
    const [vector] = extractChartVectors(section);
    expect(vector.markup).not.toContain("rgb(1, 2, 3)");
  });

  const captureWithChart = () =>
    vi.mocked(html2canvas).mockImplementation(async (_el, options) => {
      const { section } = makeChartSection();
      options?.onclone?.(document, section);
      return {
        width: 1200, // 600 CSS px at scale 2
        height: 800,
        toDataURL: () => "data:image/png;base64,fake",
      } as unknown as HTMLCanvasElement;
    });

  it("draws each chart as a vector into its place, at the section's scale", async () => {
    captureWithChart();
    svg.mockResolvedValue(undefined);

    await captureChartsToPdf(makeContainer(1), { title: "t", filename: "f.pdf" });

    const [, , sx, sy, drawWidth] = addImage.mock.calls[0];
    const k = drawWidth / 600; // PDF points per CSS pixel
    expect(svg).toHaveBeenCalledTimes(1);
    const [element, place] = svg.mock.calls[0];
    expect(element.tagName.toLowerCase()).toBe("svg");
    expect(place.x).toBeCloseTo(sx + 10 * k, 3);
    expect(place.y).toBeCloseTo(sy + 20 * k, 3);
    expect(place.width).toBeCloseTo(300 * k, 3);
    expect(place.height).toBeCloseTo(200 * k, 3);
    // No backing box: it would cover an HTML legend laid over the chart area.
    expect(rect).not.toHaveBeenCalledWith(place.x, place.y, place.width, place.height, "F");
    // The temporary host is removed again.
    expect(document.querySelectorAll("[data-pdf-vector-host]")).toHaveLength(0);
  });

  it("draws the chart as an image instead, with a warning, when svg2pdf cannot draw it", async () => {
    captureWithChart();
    svg.mockRejectedValue(new Error("unsupported element"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // JSDOM has no image decoding: the SVG copy "loads" at once.
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      value: () => Promise.resolve(),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,crop"
    );

    await captureChartsToPdf(makeContainer(1), { title: "t", filename: "f.pdf" });

    expect(addImage).toHaveBeenCalledTimes(2); // the section, then the chart as an image
    const [data, , x, y, w, h] = addImage.mock.calls[1];
    const [place] = svg.mock.calls[0].slice(1);
    expect(data).toBe("data:image/png;base64,crop");
    expect([x, y, w, h]).toEqual([place.x, place.y, place.width, place.height]);
    expect(warn).toHaveBeenCalled();
    expect(save).toHaveBeenCalled();
  });
});
