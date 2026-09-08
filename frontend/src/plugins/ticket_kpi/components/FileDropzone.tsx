import React from "react";
import { Upload, FileSpreadsheet } from "lucide-react";
import { FileInput } from "./FileInput";

interface FileDropzoneProps {
  file: File | null;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
  onFileAccepted: (file: File) => void;
}

const ACCEPTED_EXTENSIONS = ["csv", "xlsx", "xls"];

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  file,
  isDragging,
  setIsDragging,
  onFileAccepted,
}) => (
  <FileInput
    file={file}
    onFileAccepted={onFileAccepted}
    acceptedExtensions={ACCEPTED_EXTENSIONS}
    acceptAttribute=".csv,.xlsx,.xls"
    SelectedIcon={FileSpreadsheet}
    IdleIcon={Upload}
    prompt="Drag & drop or click to select CSV / XLSX / XLS"
    errorLabel="Only CSV, XLSX, XLS files allowed"
    isDragging={isDragging}
    setIsDragging={setIsDragging}
  />
);
