import api from "./api";
import { toast } from "sonner";
import { buildAnalyticsParams } from "./analytics-params";
import type { Period } from "@/pages/analytics/hooks/useAnalyticsPage";

export const exportAnalytics = async (
  selectedPeriod: Period,
  dateRange: { from: string; to: string },
  selectedTeams: string[],
  selectedUsers: string[],
  selectedStatuses: string[],
  selectedCategories: string[],
  exportFormat: "excel" | "csv"
) => {
  try {
    const params = buildAnalyticsParams(
      selectedPeriod,
      dateRange,
      selectedTeams,
      selectedUsers,
      selectedStatuses,
      selectedCategories
    );
    params.append("export_format", exportFormat);

    const response = await api.get(`plugins/analytics/metrics/export/?${params.toString()}`, {
      responseType: "blob",
    });

    const extension = exportFormat === "excel" ? "xlsx" : "csv";
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `analytics_export_${selectedPeriod}_${new Date().toISOString().split("T")[0]}.${extension}`
    );
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Export failed:", error);
    toast.error("Export failed");
  }
};
