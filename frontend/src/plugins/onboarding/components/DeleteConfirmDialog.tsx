import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  /** Non-empty for a folder that still has children — shown as extra warning. */
  childCount?: number;
  onConfirm: () => Promise<void>;
}

export const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  open,
  onOpenChange,
  name,
  childCount = 0,
  onConfirm,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete "${name}"?`}
      description={
        childCount > 0
          ? `This will also delete ${childCount} item${childCount === 1 ? "" : "s"} inside. This cannot be undone.`
          : "This cannot be undone."
      }
      onConfirm={handleConfirm}
      isConfirming={isConfirming}
      confirmLabel="Delete"
      variant="destructive"
      icon={<Trash2 className="h-4 w-4" />}
    />
  );
};
