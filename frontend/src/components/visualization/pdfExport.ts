import { jsPDF } from "jspdf";
import html2canvas from "html2canvas-pro";

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
 * Applies clean, high-contrast print styling during DOM cloning. Enforces solid white
 * backgrounds for cards, crisp borders, and removes interactive-only web controls.
 */
export function applyPrintStyles(cloned: HTMLElement): void {
  cloned.style.backgroundColor = "#ffffff";
  cloned.style.color = "#0f172a";

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

interface CapturedItem {
  canvas: HTMLCanvasElement;
  isFullWidth: boolean;
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
    const canvas = await html2canvas(sections[i], {
      scale: 2,
      backgroundColor: "#ffffff",
      onclone: (_doc, cloned) => {
        expandScrollRegions(cloned);
        applyPrintStyles(cloned);
      },
      ...(extra > 0 && {
        height: Math.ceil(sections[i].getBoundingClientRect().height + extra),
      }),
    });

    if (canvas.width === 0 || canvas.height === 0) continue;
    captured.push({ canvas, isFullWidth: isFull });
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
