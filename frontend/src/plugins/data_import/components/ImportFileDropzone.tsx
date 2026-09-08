import React, { useCallback } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";

interface ImportFileDropzoneProps {
  file: File | null;
  onFileAccepted: (file: File) => void;
  isDragging?: boolean;
}

export const ImportFileDropzone: React.FC<ImportFileDropzoneProps> = ({
  file,
  onFileAccepted,
  isDragging = false,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      onFileAccepted(selected);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const dropped = e.dataTransfer.files?.[0];
      if (dropped) {
        onFileAccepted(dropped);
      }
    },
    [onFileAccepted]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const isValidType = (name: string) => {
    const lower = name.toLowerCase();
    return lower.endsWith(".csv") || lower.endsWith(".xlsx") || lower.endsWith(".xls");
  };

  return (
    <GlassCard isHoverLift={false} className="p-4">
      <div>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={`flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-8 transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30"
          }`}
        >
          {file ? (
            <>
              <FileSpreadsheet className="h-10 w-10 text-primary" />
              <div className="text-center">
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              {!isValidType(file.name) && (
                <p className="text-sm text-destructive">
                  Only CSV, XLSX, or XLS files are supported.
                </p>
              )}
            </>
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">Drag & drop a file here, or click to browse</p>
                <p className="text-sm text-muted-foreground">Supports CSV, XLSX, and XLS</p>
              </div>
            </>
          )}
          <input
            id="import-file-input"
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleChange}
          />
          <Button asChild variant="outline" size="sm">
            <label htmlFor="import-file-input" className="cursor-pointer">
              {file ? "Replace file" : "Select file"}
            </label>
          </Button>
        </div>
      </div>
    </GlassCard>
  );
};
