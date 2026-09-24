import React, { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadDropzoneProps {
  onFiles: (files: File[]) => void;
}

/** OS → browser file drops only. Checks `dataTransfer.types` for "Files" so
 * an in-app dnd-kit drag (pointer-based, never populates dataTransfer) is
 * never mistaken for an external file drop. */
export const UploadDropzone: React.FC<UploadDropzoneProps> = ({ onFiles }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  const handleDragOver = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    setIsDragging(false);
    if (!isFileDrag(e)) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  };

  return (
    <div
      data-testid="onboarding-upload-dropzone"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      aria-label="Upload files"
      className={cn(
        "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center text-muted-foreground transition-all duration-200",
        isDragging
          ? "scale-[1.01] border-primary bg-primary/5 shadow-glass"
          : "border-border hover:border-border-focus hover:bg-accent/50"
      )}
    >
      <input
        ref={inputRef}
        data-testid="onboarding-upload-input"
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
      <div
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full transition-transform duration-200",
          isDragging && "scale-110"
        )}
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--chart-3) / 0.28), hsl(var(--chart-3) / 0.08))",
        }}
      >
        <UploadCloud className="h-6 w-6 text-chart-3" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-foreground">Drop files here, or click to browse</p>
      <p className="text-xs">PDF, Office docs, images, CSV, ZIP — up to 25 MB</p>
    </div>
  );
};
