import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * One-page-per-chart PDF of the visible chart widgets (cards inside `containerRef` carry
 * `data-chart-section`). The PDF libraries load on first use only.
 */
export function useDashboardPdfExport(containerRef: React.RefObject<HTMLElement | null>) {
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);

  const exportPdf = async () => {
    const container = containerRef.current;
    if (!container || !container.querySelector("[data-chart-section]")) {
      toast.info("Nothing to export: turn on a chart widget first.");
      return;
    }
    setExporting(true);
    try {
      const { captureChartsToPdf } = await import("@/components/visualization/pdfExport");
      await captureChartsToPdf(container, {
        title: "Admin Dashboard",
        filename: `admin-dashboard-${today()}.pdf`,
        generatedBy: user?.full_name || user?.username,
      });
    } catch {
      toast.error("Could not create the PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return { exporting, exportPdf };
}
