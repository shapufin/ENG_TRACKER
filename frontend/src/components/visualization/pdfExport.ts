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
 * `onclone` hook: lets the cloned section grow to its content, so scrolled-away rows are
 * drawn instead of cut off. The section keeps its own overflow (rounded corners stay).
 */
export function expandScrollRegions(section: HTMLElement): void {
  section.style.height = "auto";
  section.style.maxHeight = "none";
  for (const el of section.querySelectorAll<HTMLElement>("*")) {
    if (!scrolls(el)) continue;
    el.style.overflow = "visible";
    el.style.height = "auto";
    el.style.maxHeight = "none";
  }
}

/** Captures every `[data-chart-section]` node inside `container`, in DOM
 * order, into an A4 PDF. Multiple charts are bundled onto pages based on available
 * height rather than forcing a page break per section, eliminating empty white space.
 * Includes a professional document header on page 1, running headers on subsequent
 * pages, and two-pass page numbering ("Page X of Y") in the footer.
 *
 * Uses html2canvas-pro because Tailwind v4's `oklch()` CSS colors aren't parsed
 * by the unmaintained original. */
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

  // Header and footer vertical coordinates
  const page1StartY = margin + 38; // room for primary document title, metadata, divider
  const subsequentStartY = margin + 24; // room for running header and divider
  const footerLineY = pageHeight - margin - 12;
  const usableBottomY = footerLineY - 10;
  const GAP = 14; // vertical gap between bundled charts on the same page

  const provenanceParts = [`Generated ${new Date().toLocaleString()}`];
  if (generatedBy) provenanceParts.push(`by ${generatedBy}`);
  if (periodLabel) provenanceParts.push(`Data as of ${periodLabel}`);
  const provenanceLine = provenanceParts.join(" · ");

  let currentY = page1StartY;
  let rendered = 0;

  for (let i = 0; i < sections.length; i++) {
    const extra = hiddenScrollExtent(sections[i]);
    const canvas = await html2canvas(sections[i], {
      scale: 2,
      backgroundColor: null,
      onclone: (_doc, cloned) => expandScrollRegions(cloned),
      // The canvas is sized from the live node, so make room for what the clone reveals.
      ...(extra > 0 && {
        height: Math.ceil(sections[i].getBoundingClientRect().height + extra),
      }),
    });

    // Zero-area sections (hidden/collapsed) would produce Infinity/NaN
    // dimensions below — skip them instead of throwing inside addImage.
    if (canvas.width === 0 || canvas.height === 0) continue;

    // Available height on a fresh page (to bound scale for unusually tall sections)
    const freshPageMaxHeight = usableBottomY - (rendered === 0 ? page1StartY : subsequentStartY);

    // Scale by a single factor for both dimensions so the aspect ratio is preserved
    let scale = maxWidth / canvas.width;
    if (canvas.height * scale > freshPageMaxHeight) {
      scale = freshPageMaxHeight / canvas.height;
    }
    const drawWidth = canvas.width * scale;
    const drawHeight = canvas.height * scale;
    const x = margin + (maxWidth - drawWidth) / 2;

    // If this section would overflow the current page, and there is already content on it,
    // start a new page.
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
    rendered++;
  }

  // Nothing renderable (all sections zero-area) — don't download a blank PDF.
  if (rendered === 0) return;

  // Two-pass header and footer stamping with accurate total page count
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);

    pdf.setDrawColor(226, 232, 240); // slate-200 divider
    pdf.setLineWidth(0.75);

    if (p === 1) {
      // Primary document header
      pdf.setFontSize(13);
      pdf.setTextColor(24, 30, 42); // slate-900
      pdf.text(title, margin, margin + 11);

      pdf.setFontSize(7.5);
      pdf.setTextColor(100, 116, 139); // slate-500
      pdf.text(provenanceLine, margin, margin + 23);

      pdf.line(margin, margin + 28, pageWidth - margin, margin + 28);
    } else {
      // Running header on pages 2+
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139); // slate-500
      pdf.text(title, margin, margin + 8);

      if (periodLabel) {
        pdf.text(periodLabel, pageWidth - margin, margin + 8, { align: "right" });
      }

      pdf.line(margin, margin + 14, pageWidth - margin, margin + 14);
    }

    // Running footer on all pages
    pdf.line(margin, footerLineY, pageWidth - margin, footerLineY);

    pdf.setFontSize(7);
    pdf.setTextColor(148, 163, 184); // slate-400
    pdf.text(title, margin, footerLineY + 9);
    pdf.text(`Page ${p} of ${totalPages}`, pageWidth - margin, footerLineY + 9, {
      align: "right",
    });
  }

  pdf.save(filename);
}
