import { jsPDF } from "jspdf";
import html2canvas from "html2canvas-pro";
// Adds `jsPDF.svg()`, which draws an <svg> as vector paths and real text.
import "svg2pdf.js";

/** html2canvas capture scale: canvas pixels per CSS pixel. */
const CAPTURE_SCALE = 2;
/** The plot surface Recharts renders; legends and tooltips are HTML around it. */
const CHART_SVG = ".recharts-wrapper > svg.recharts-surface";
/** Paint read from the computed style: Recharts writes `hsl(var(--token))`, which svg2pdf cannot resolve. */
const PAINT_PROPERTIES = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-opacity",
  "opacity",
  "stop-color",
  "stop-opacity",
  "font-size",
  "font-weight",
];

interface CaptureToPdfOptions {
  title: string;
  filename: string;
  /** Display name of the user generating this evidence export. */
  generatedBy?: string;
  /** Human-readable label for the data's as-of period (e.g. "March 2026"). */
  periodLabel?: string;
}

const scrolls = (el: HTMLElement) => {
  const overflowY = el.ownerDocument.defaultView?.getComputedStyle(el).overflowY;
  return overflowY === "auto" || overflowY === "scroll";
};

/**
 * Pixels a section's scrolling regions hide (card bodies have a fixed height and scroll).
 * Measured on the live node: html2canvas sizes the canvas from it, not from the clone.
 */
export function hiddenScrollExtent(section: HTMLElement): number {
  let extra = 0;
  for (const el of section.querySelectorAll<HTMLElement>("*")) {
    if (scrolls(el)) extra += Math.max(0, el.scrollHeight - el.clientHeight);
  }
  return extra;
}

/**
 * `onclone` hook: lets the cloned section grow to its content when it contains
 * scrollable regions with hidden overflow. For non-scrolling chart cards, height
 * is preserved so Recharts percentage-height containers render cleanly.
 */
export function expandScrollRegions(section: HTMLElement): void {
  if (hiddenScrollExtent(section) === 0) return;

  section.style.height = "auto";
  section.style.maxHeight = "none";
  for (const el of section.querySelectorAll<HTMLElement>("*")) {
    if (!scrolls(el)) continue;
    el.style.overflow = "visible";
    el.style.height = "auto";
    el.style.maxHeight = "none";
  }
}

/**
 * Applies clean, high-contrast print styling during DOM cloning. Strips `.dark` from the
 * cloned root so `src/index.css` `:root` light tokens apply verbatim without palette drift,
 * makes gradient-clipped hero text solid ink for html2canvas, and hides web-only buttons.
 */
export function applyPrintStyles(cloned: HTMLElement): void {
  const docEl = cloned.ownerDocument?.documentElement;
  if (docEl) {
    docEl.classList.remove("dark");
    docEl.style.colorScheme = "light";
  }
  cloned.classList?.remove?.("dark");
  cloned.style.backgroundColor = "#ffffff";
  cloned.style.color = "#0f172a";

  // html2canvas does not render `bg-clip-text text-transparent` gradients reliably.
  const solidTargets = cloned.querySelectorAll<HTMLElement>(
    "[data-pdf-solid-text], .bg-clip-text.text-transparent"
  );
  for (const el of solidTargets) {
    el.style.backgroundImage = "none";
    el.style.backgroundClip = "border-box";
    el.style.webkitBackgroundClip = "border-box";
    el.style.webkitTextFillColor = "#0f172a";
    el.style.color = "#0f172a";
    el.style.filter = "none";
  }

  const actionButtons = cloned.querySelectorAll<HTMLElement>(
    "button, [role='menu'], [aria-haspopup='menu'], .no-pdf"
  );
  for (const el of actionButtons) {
    if (
      el.tagName === "BUTTON" &&
      (el.innerText?.includes("Export") ||
        el.innerText?.includes("Edit") ||
        el.getAttribute("aria-label")?.includes("action"))
    ) {
      el.style.display = "none";
    }
  }
}

/**
 * Determines whether a section should span full width in the PDF or occupy a half-width column.
 */
export function isSectionFullWidth(section: HTMLElement, container: HTMLElement): boolean {
  const explicit = section.getAttribute("data-pdf-span");
  if (explicit === "full") return true;
  if (explicit === "half") return false;

  const containerWidth = container.getBoundingClientRect?.().width ?? 0;
  const sectionWidth = section.getBoundingClientRect?.().width ?? 0;

  if (containerWidth > 0 && sectionWidth > 0) {
    return sectionWidth / containerWidth >= 0.68;
  }

  const cls = section.className || "";
  if (cls.includes("col-span-full") || cls.includes("w-full")) return true;

  return true;
}

/** One chart of a section: self-contained SVG markup and its box, in CSS px from the section's corner. */
export interface ChartVector {
  markup: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * svg2pdf averages `stop-opacity` into one opacity for the whole gradient, so a fading area fill
 * prints flat. Charts print on white, so each stop is blended onto white and made opaque instead.
 */
function blendStopOnWhite(stop: Element): void {
  const rgb = (stop.getAttribute("stop-color") ?? "").match(/^rgba?\(([^)]+)\)$/);
  if (!rgb) return;
  const [r, g, b, colourAlpha = 1] = rgb[1].split(",").map(Number);
  const alpha = colourAlpha * Number(stop.getAttribute("stop-opacity") ?? 1);
  const mix = (channel: number) => Math.round(255 + (channel - 255) * alpha);
  stop.setAttribute("stop-color", `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`);
  stop.setAttribute("stop-opacity", "1");
}

let chartCopies = 0;

/**
 * svg2pdf resolves `url(#id)` and `href="#id"` in the document, where the live chart carries the
 * same ids and comes first (its gradients still use `var(--token)`). The copy gets its own ids.
 */
function renameIds(copy: SVGSVGElement): void {
  const prefix = `pdf-chart-${++chartCopies}-`;
  const ids = new Set(Array.from(copy.querySelectorAll("[id]"), (el) => el.id));
  if (ids.size === 0) return;
  const rename = (id: string, whole: string) =>
    ids.has(id) ? whole.replace(id, prefix + id) : whole;
  for (const el of [copy, ...Array.from(copy.querySelectorAll("*"))]) {
    if (ids.has(el.id)) el.id = prefix + el.id;
    for (const attr of Array.from(el.attributes)) {
      const value = attr.value
        .replace(/url\(#([^)]+)\)/g, (whole, id: string) => rename(id, whole))
        .replace(/^#(.+)$/, (whole, id: string) => rename(id, whole));
      if (value !== attr.value) el.setAttributeNS(attr.namespaceURI, attr.name, value);
    }
  }
}

/**
 * Copies every Recharts chart of `section` with its computed paint written as attributes, so
 * the copy draws the same outside the page, then hides the chart: the section image keeps its
 * space and any HTML laid over it (legends) without the plot. Run it on the print clone only
 * (light theme applied). A chart inside `aria-hidden="true"` is decoration behind other content
 * (the engagement score card's faded wave, faded by its wrapper): it stays in the section image.
 */
export function extractChartVectors(section: HTMLElement): ChartVector[] {
  const view = section.ownerDocument.defaultView ?? window;
  const box = section.getBoundingClientRect();
  // Only aria-hidden inside the section counts: an open dialog marks the whole app shell hidden.
  const charts = Array.from(section.querySelectorAll<SVGSVGElement>(CHART_SVG)).filter((chart) => {
    const hidden = chart.closest('[aria-hidden="true"]');
    return hidden === null || !section.contains(hidden);
  });
  return charts.map((chart) => {
    const where = chart.getBoundingClientRect();
    const copy = chart.cloneNode(true) as SVGSVGElement;
    const sources = [chart, ...Array.from(chart.querySelectorAll("*"))];
    const targets = [copy, ...Array.from(copy.querySelectorAll("*"))];
    // html2canvas inlines the live page's computed style (dark mode included) on these nodes;
    // without it the print theme cascades. The root keeps its own: it sizes the hidden chart.
    for (const node of sources.slice(1)) node.removeAttribute("style");
    sources.forEach((source, i) => {
      const style = view.getComputedStyle(source);
      // html2canvas's clone inlines every computed property; svg2pdf lets inline style win over
      // the attributes below, which brought back the absolute url() fills and stop opacity.
      targets[i].removeAttribute("style");
      for (const property of PAINT_PROPERTIES) {
        const value = style.getPropertyValue(property);
        // Keep paint servers as written (`url(#id)`): the computed form is an absolute URL.
        const own = targets[i].getAttribute(property) ?? "";
        if (value && !value.startsWith("url(") && !own.startsWith("url(")) {
          targets[i].setAttribute(property, value);
        }
      }
      const tag = source.tagName.toLowerCase();
      // The app font is not embedded in jsPDF; Helvetica is one of its built-in fonts.
      if (tag === "text" || tag === "tspan") targets[i].setAttribute("font-family", "helvetica");
      if (tag === "stop") blendStopOnWhite(targets[i]);
    });
    renameIds(copy);
    chart.style.visibility = "hidden";
    return {
      markup: new XMLSerializer().serializeToString(copy),
      x: where.left - box.left,
      y: where.top - box.top,
      width: where.width,
      height: where.height,
    };
  });
}

interface CapturedItem {
  canvas: HTMLCanvasElement;
  isFullWidth: boolean;
  vectors: ChartVector[];
}

/** The chart copy rendered to a PNG at the capture scale (used when svg2pdf cannot draw it). */
async function rasterizeChart(chart: ChartVector): Promise<string> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chart.markup)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(chart.width * CAPTURE_SCALE);
  canvas.height = Math.round(chart.height * CAPTURE_SCALE);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/**
 * Draws the charts of a placed section as vectors into the space its image left for them.
 * A chart svg2pdf cannot draw is placed as an image of the same copy, so it is never missing.
 */
async function drawChartVectors(
  pdf: jsPDF,
  item: CapturedItem,
  x: number,
  y: number,
  drawWidth: number
): Promise<void> {
  const k = (drawWidth * CAPTURE_SCALE) / item.canvas.width; // PDF points per CSS pixel
  for (const chart of item.vectors) {
    const place = {
      x: x + chart.x * k,
      y: y + chart.y * k,
      width: chart.width * k,
      height: chart.height * k,
    };
    // svg2pdf measures text, so the SVG has to be in a rendered document.
    const host = document.createElement("div");
    host.setAttribute("data-pdf-vector-host", "");
    host.style.cssText = "position:fixed;left:-10000px;top:0;pointer-events:none;";
    host.innerHTML = chart.markup;
    document.body.appendChild(host);
    try {
      await pdf.svg(host.firstElementChild as Element, place);
    } catch (error) {
      console.warn("PDF export: chart drawn as an image, svg2pdf could not draw it", error);
      const png = await rasterizeChart(chart);
      pdf.addImage(png, "PNG", place.x, place.y, place.width, place.height, undefined, "FAST");
    } finally {
      host.remove();
    }
  }
}

/**
 * Captures every `[data-chart-section]` node inside `container`, in DOM order, into an A4 PDF.
 * Compact sections are automatically packed in a balanced 2-column grid rather than stretched,
 * while wide charts and metric banners span full width.
 *
 * Includes an executive corporate masthead with structured metadata on Page 1, running headers
 * on subsequent pages, and two-pass page numbering ("Page X of Y") with confidentiality notices.
 */
export async function captureChartsToPdf(
  container: HTMLElement,
  { title, filename, generatedBy, periodLabel }: CaptureToPdfOptions
): Promise<void> {
  const sections = Array.from(container.querySelectorAll<HTMLElement>("[data-chart-section]"));
  if (sections.length === 0) return;

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 32;
  const maxWidth = pageWidth - margin * 2;
  const GAP = 14;
  const colWidth = (maxWidth - GAP) / 2;

  // Header and footer vertical coordinates
  const page1StartY = margin + 76; // room for enterprise masthead, provenance line, metadata
  const subsequentStartY = margin + 24; // room for running header and divider
  const footerLineY = pageHeight - margin - 12;
  const usableBottomY = footerLineY - 10;

  const provenanceParts = [`Generated ${new Date().toLocaleString()}`];
  if (generatedBy) provenanceParts.push(`by ${generatedBy}`);
  if (periodLabel) provenanceParts.push(`Data as of ${periodLabel}`);
  const provenanceLine = provenanceParts.join(" · ");

  // 1. Capture all sections
  const captured: CapturedItem[] = [];
  for (let i = 0; i < sections.length; i++) {
    const extra = hiddenScrollExtent(sections[i]);
    const isFull = isSectionFullWidth(sections[i], container);
    let vectors: ChartVector[] = [];
    const canvas = await html2canvas(sections[i], {
      scale: CAPTURE_SCALE,
      backgroundColor: "#ffffff",
      onclone: (_doc, cloned) => {
        expandScrollRegions(cloned);
        applyPrintStyles(cloned);
        vectors = extractChartVectors(cloned);
      },
      ...(extra > 0 && {
        height: Math.ceil(sections[i].getBoundingClientRect().height + extra),
      }),
    });

    if (canvas.width === 0 || canvas.height === 0) continue;
    captured.push({ canvas, isFullWidth: isFull, vectors });
  }

  if (captured.length === 0) return;

  // 2. Multi-column flow layout
  let currentY = page1StartY;
  let rendered = 0;
  let idx = 0;

  while (idx < captured.length) {
    const current = captured[idx];
    const next = captured[idx + 1];

    if (!current.isFullWidth && next && !next.isFullWidth) {
      // 2-Column Pair: Place side-by-side
      const leftCanvas = current.canvas;
      const rightCanvas = next.canvas;

      let leftScale = colWidth / leftCanvas.width;
      let rightScale = colWidth / rightCanvas.width;

      let leftHeight = leftCanvas.height * leftScale;
      let rightHeight = rightCanvas.height * rightScale;
      let rowHeight = Math.max(leftHeight, rightHeight);

      const freshPageMaxHeight = usableBottomY - (rendered === 0 ? page1StartY : subsequentStartY);
      if (rowHeight > freshPageMaxHeight) {
        const factor = freshPageMaxHeight / rowHeight;
        leftScale *= factor;
        rightScale *= factor;
        leftHeight *= factor;
        rightHeight *= factor;
        rowHeight = freshPageMaxHeight;
      }

      const leftDrawWidth = leftCanvas.width * leftScale;
      const rightDrawWidth = rightCanvas.width * rightScale;

      if (rendered > 0 && currentY + rowHeight > usableBottomY) {
        pdf.addPage();
        currentY = subsequentStartY;
      }

      pdf.addImage(
        leftCanvas.toDataURL("image/png"),
        "PNG",
        margin,
        currentY,
        leftDrawWidth,
        leftHeight,
        undefined,
        "FAST"
      );

      pdf.addImage(
        rightCanvas.toDataURL("image/png"),
        "PNG",
        margin + colWidth + GAP,
        currentY,
        rightDrawWidth,
        rightHeight,
        undefined,
        "FAST"
      );
      await drawChartVectors(pdf, current, margin, currentY, leftDrawWidth);
      await drawChartVectors(pdf, next, margin + colWidth + GAP, currentY, rightDrawWidth);

      currentY += rowHeight + GAP;
      rendered += 2;
      idx += 2;
    } else {
      // Single Item: Full-Width or Single Half-Width
      const canvas = current.canvas;
      const targetWidth = current.isFullWidth ? maxWidth : colWidth;

      let scale = targetWidth / canvas.width;
      const freshPageMaxHeight = usableBottomY - (rendered === 0 ? page1StartY : subsequentStartY);
      if (canvas.height * scale > freshPageMaxHeight) {
        scale = freshPageMaxHeight / canvas.height;
      }

      const drawWidth = canvas.width * scale;
      const drawHeight = canvas.height * scale;
      const x = current.isFullWidth ? margin + (maxWidth - drawWidth) / 2 : margin;

      if (rendered > 0 && currentY + drawHeight > usableBottomY) {
        pdf.addPage();
        currentY = subsequentStartY;
      }

      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        x,
        currentY,
        drawWidth,
        drawHeight,
        undefined,
        "FAST"
      );
      await drawChartVectors(pdf, current, x, currentY, drawWidth);

      currentY += drawHeight + GAP;
      rendered += 1;
      idx += 1;
    }
  }

  if (rendered === 0) return;

  // 3. Two-pass header and footer stamping
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);

    pdf.setDrawColor(226, 232, 240); // slate-200
    pdf.setLineWidth(0.75);

    if (p === 1) {
      // Top brand accent line
      if (typeof pdf.setFillColor === "function") {
        pdf.setFillColor(15, 23, 42); // slate-900
        pdf.rect(margin, margin, maxWidth, 2.5, "F");
      }

      // Eyebrow label
      pdf.setFontSize(7);
      pdf.setTextColor(100, 116, 139); // slate-500
      pdf.text("ENGINEERING TRACKER  ·  EXECUTIVE OPERATIONS REPORT", margin, margin + 12);

      // Classification tag
      pdf.text("CONFIDENTIAL · INTERNAL USE ONLY", pageWidth - margin, margin + 12, {
        align: "right",
      });

      // Primary title
      pdf.setFontSize(14);
      pdf.setTextColor(15, 23, 42); // slate-900
      pdf.text(title, margin, margin + 26);

      // Structured Provenance Line
      pdf.setFontSize(7.5);
      pdf.setTextColor(100, 116, 139); // slate-500
      pdf.text(provenanceLine, margin, margin + 37);

      // Executive Metadata Panel (light slate background)
      const panelY = margin + 43;
      const panelHeight = 22;
      if (typeof pdf.setFillColor === "function") {
        pdf.setFillColor(248, 250, 252); // slate-50
        if (typeof (pdf as unknown as { roundedRect?: unknown }).roundedRect === "function") {
          (pdf as unknown as { roundedRect: (...args: unknown[]) => void }).roundedRect(
            margin,
            panelY,
            maxWidth,
            panelHeight,
            2,
            2,
            "FD"
          );
        } else {
          pdf.rect(margin, panelY, maxWidth, panelHeight, "FD");
        }
      }

      pdf.setFontSize(6);
      pdf.setTextColor(148, 163, 184); // slate-400
      pdf.text("SCOPE", margin + 8, panelY + 9);
      pdf.text("DATA PERIOD", margin + 130, panelY + 9);
      pdf.text("ISSUED TO", margin + 270, panelY + 9);
      pdf.text("CLASSIFICATION", margin + 390, panelY + 9);

      pdf.setFontSize(7);
      pdf.setTextColor(30, 41, 59); // slate-800
      pdf.text("Enterprise Operations", margin + 8, panelY + 18);
      pdf.text(periodLabel || "Current Period", margin + 130, panelY + 18);
      pdf.text(generatedBy || "Authorized User", margin + 270, panelY + 18);
      pdf.text("Official Record", margin + 390, panelY + 18);

      pdf.setDrawColor(226, 232, 240);
      pdf.line(margin, panelY + panelHeight + 6, pageWidth - margin, panelY + panelHeight + 6);
    } else {
      // Running header on pages 2+
      pdf.setFontSize(8);
      pdf.setTextColor(71, 85, 105); // slate-600
      pdf.text(`Engineering Tracker · ${title}`, margin, margin + 8);

      if (periodLabel) {
        pdf.setFontSize(7.5);
        pdf.setTextColor(100, 116, 139);
        pdf.text(periodLabel, pageWidth - margin, margin + 8, { align: "right" });
      }

      pdf.line(margin, margin + 14, pageWidth - margin, margin + 14);
    }

    // Running footer on all pages
    pdf.line(margin, footerLineY, pageWidth - margin, footerLineY);

    pdf.setFontSize(6.5);
    pdf.setTextColor(148, 163, 184); // slate-400
    pdf.text("CONFIDENTIAL & PROPRIETARY — ENGINEERING TRACKER", margin, footerLineY + 9);
    pdf.text(title, pageWidth / 2, footerLineY + 9, { align: "center" });

    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139); // slate-500
    pdf.text(`Page ${p} of ${totalPages}`, pageWidth - margin, footerLineY + 9, {
      align: "right",
    });
  }

  pdf.save(filename);
}
