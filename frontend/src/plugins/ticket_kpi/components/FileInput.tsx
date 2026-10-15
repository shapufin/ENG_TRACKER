import React, { useRef, useState } from "react";
import { Upload, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

interface FileInputProps {
  file: File | null;
  onFileAccepted: (file: File) => void;
  acceptedExtensions: string[];
  acceptAttribute: string;
  SelectedIcon: LucideIcon;
  IdleIcon?: LucideIcon;
  prompt: string;
  subPrompt?: string;
  errorLabel: string;
  padding?: "sm" | "md";
  isDragging?: boolean;
  setIsDragging?: (dragging: boolean) => void;
}

export const FileInput: React.FC<FileInputProps> = ({
  file,
  onFileAccepted,
  acceptedExtensions,
  acceptAttribute,
  SelectedIcon,
  IdleIcon = Upload,
  prompt,
  subPrompt,
  errorLabel,
  padding = "md",
  isDragging: controlledDragging,
  setIsDragging: setControlledDragging,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [internalDragging, setInternalDragging] = useState(false);

  const isDragging = controlledDragging ?? internalDragging;
  const setIsDragging = setControlledDragging ?? setInternalDragging;

  const acceptFile = (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!acceptedExtensions.includes(ext || "")) {
      toast.error(errorLabel);
      return;
    }
    onFileAccepted(f);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  };

  const paddingClass = padding === "sm" ? "p-6" : "p-8";

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-lg border-2 border-dashed ${paddingClass} text-center transition-colors ${
        isDragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={acceptAttribute}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && acceptFile(e.target.files[0])}
      />
      <div className="text-muted-foreground flex flex-col items-center gap-2">
        {file ? (
          <>
            <SelectedIcon className="text-primary h-8 w-8" />
            <p className="text-foreground font-medium">{file.name}</p>
            <p className="text-xs">{(file.size / 1024).toFixed(1)} KB</p>
          </>
        ) : (
          <>
            <IdleIcon className="h-8 w-8" />
            <p>{prompt}</p>
            {subPrompt && <p className="text-xs">{subPrompt}</p>}
          </>
        )}
      </div>
    </div>
  );
};
