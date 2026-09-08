import React from "react";
import { Upload, File } from "lucide-react";
import { FileInput } from "../FileInput";

const ACCEPTED_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "eml",
  "msg",
  "txt",
  "html",
  "htm",
];

interface EvidenceFileInputProps {
  file: File | null;
  onFileAccepted: (file: File) => void;
}

export const EvidenceFileInput: React.FC<EvidenceFileInputProps> = ({ file, onFileAccepted }) => (
  <FileInput
    file={file}
    onFileAccepted={onFileAccepted}
    acceptedExtensions={ACCEPTED_EXTENSIONS}
    acceptAttribute=".pdf,.png,.jpg,.jpeg,.gif,.webp,.eml,.msg,.txt,.html,.htm"
    SelectedIcon={File}
    IdleIcon={Upload}
    prompt="Click or drop a file"
    subPrompt="PDF, image, email, text, or HTML"
    errorLabel={`Accepted files: ${ACCEPTED_EXTENSIONS.join(", ")}`}
    padding="sm"
  />
);
