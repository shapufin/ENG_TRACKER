import React, { useState } from "react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

interface ExportDashboardPdfButtonProps {
  /** Element holding the dashboard widgets; chart cards inside it carry `data-chart-section`. */
  containerRef: React.RefObject<HTMLElement | null>;
}

const today = () => new Date().toISOString().slice(0, 10);

/** One-page-per-chart PDF of the visible chart widgets. The PDF libraries load on click only. */
export const ExportDashboardPdfButton: React.FC<ExportDashboardPdfButtonProps> = ({
  containerRef,
}) => {
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
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

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void handleExport()}
      disabled={exporting}
      aria-busy={exporting}
    >
      <FileDown className="mr-2 h-4 w-4" aria-hidden /> Export PDF
    </Button>
  );
};
