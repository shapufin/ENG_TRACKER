import { jsPDF } from "jspdf";
import html2canvas from "html2canvas-pro";

interface CaptureToPdfOptions {
  title: string;
  filename: string;
}

/** Captures every `[data-chart-section]` node inside `container`, in DOM
 * order, into a single portrait A4 PDF — one section per page. WYSIWYG:
 * this snapshots what's actually on screen (colors, gradients, final
 * animation state), so the PDF always matches the live gallery. Uses
 * html2canvas-pro (not plain html2canvas) because Tailwind v4's `oklch()`
 * CSS colors aren't parsed by the unmaintained original. */
export async function captureChartsToPdf(
  container: HTMLElement,
  { title, filename }: CaptureToPdfOptions
): Promise<void> {
  const sections = Array.from(container.querySelectorAll<HTMLElement>("[data-chart-section]"));
  if (sections.length === 0) return;

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 32;
  const headerSpace = 20;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2 - headerSpace;

  let rendered = 0;
  for (let i = 0; i < sections.length; i++) {
    const canvas = await html2canvas(sections[i], { scale: 2, backgroundColor: null });

    // Zero-area sections (hidden/collapsed) would produce Infinity/NaN
    // dimensions below — skip them instead of throwing inside addImage.
    if (canvas.width === 0 || canvas.height === 0) continue;

    // Scale by a single factor for both dimensions so the aspect ratio is
    // preserved — clamping height alone would stretch/squish the image
    // since `addImage` maps the canvas onto whatever w/h it's given.
    const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
    const drawWidth = canvas.width * scale;
    const drawHeight = canvas.height * scale;
    const x = margin + (maxWidth - drawWidth) / 2;

    if (rendered > 0) pdf.addPage();
    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text(title, margin, margin - 12);
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, margin, drawWidth, drawHeight);
    rendered++;
  }

  // Nothing renderable (all sections zero-area) — don't download a blank PDF.
  if (rendered === 0) return;

  pdf.save(filename);
}
