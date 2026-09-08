import React from "react";

import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { Trash2 } from "lucide-react";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  isConfirming: boolean;
}

export const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isConfirming,
}) => (
  <ConfirmDialog
    open={open}
    onOpenChange={onOpenChange}
    title={title}
    description={description}
    onConfirm={onConfirm}
    isConfirming={isConfirming}
    confirmLabel="Delete"
    variant="destructive"
  />
);

interface BulkDeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onConfirm: () => void;
  isConfirming: boolean;
}

export const BulkDeleteConfirmDialog: React.FC<BulkDeleteConfirmDialogProps> = ({
  open,
  onOpenChange,
  selectedCount,
  onConfirm,
  isConfirming,
}) => (
  <ConfirmDialog
    open={open}
    onOpenChange={onOpenChange}
    title="Bulk Delete"
    description={`Delete ${selectedCount} selected entries? This action cannot be undone.`}
    onConfirm={onConfirm}
    isConfirming={isConfirming}
    confirmLabel="Delete"
    variant="destructive"
  />
);

interface RejectConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rejectReason: string;
  onRejectReasonChange: (v: string) => void;
  onConfirm: () => void;
  isConfirming: boolean;
}

export const RejectConfirmDialog: React.FC<RejectConfirmDialogProps> = ({
  open,
  onOpenChange,
  rejectReason,
  onRejectReasonChange,
  onConfirm,
  isConfirming,
}) => (
  <ConfirmDialog
    open={open}
    onOpenChange={onOpenChange}
    title="Reject Entry"
    description="Provide a reason for rejection:"
    onConfirm={onConfirm}
    isConfirming={isConfirming}
    confirmLabel="Reject"
    variant="destructive"
  >
    <div className="pt-2">
      <Input
        placeholder="Rejection reason"
        value={rejectReason}
        onChange={(e) => onRejectReasonChange(e.target.value)}
      />
    </div>
  </ConfirmDialog>
);

interface HoursLogBulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  onDelete: () => void;
  isPending: boolean;
}

export const HoursLogBulkActionBar: React.FC<HoursLogBulkActionBarProps> = ({
  selectedCount,
  onClear,
  onDelete,
  isPending,
}) => (
  <BulkActionBar
    selectedCount={selectedCount}
    onClear={onClear}
    actions={[
      {
        label: "Delete Selected",
        icon: Trash2,
        variant: "destructive",
        onClick: onDelete,
        disabled: isPending,
      },
    ]}
  />
);
