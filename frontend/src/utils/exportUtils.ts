/**
 * Utility to export data to CSV or JSON format.
 */
const triggerBlobDownload = (blob: Blob, filename: string, extension: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.${extension}`;
  a.click();
  URL.revokeObjectURL(url);
};

export const exportData = <T extends object>(
  data: T[],
  filename: string,
  format: "csv" | "json",
  csvConfig?: {
    headers: string[];
    rowMapper: (item: T) => string[];
  }
) => {
  if (format === "json") {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    triggerBlobDownload(blob, filename, "json");
  } else if (csvConfig) {
    const { headers, rowMapper } = csvConfig;
    const rows = data.map(rowMapper);
    const csvContent = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    triggerBlobDownload(blob, filename, "csv");
  }
};
