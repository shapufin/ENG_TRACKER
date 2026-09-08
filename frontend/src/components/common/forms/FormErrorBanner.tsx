import React from "react";
import { AlertCircle } from "lucide-react";

interface FormErrorBannerProps {
  message?: string;
}

export const FormErrorBanner: React.FC<FormErrorBannerProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
};
