import React from "react";
import {
  DeleteConfirmDialog,
  BulkDeleteConfirmDialog,
  RejectConfirmDialog,
} from "./HoursLogDialogs";

interface HoursLogConfirmDialogsProps {
  deleteOpen: boolean;
  setDeleteOpen: (v: boolean) => void;
  deleteTitle: string;
  deleteDescription: string;
  onDelete: () => void;
  deleteIsConfirming: boolean;
  bulkDeleteOpen: boolean;
  setBulkDeleteOpen: (v: boolean) => void;
  selectedCount: number;
  onBulkDelete: () => void;
  bulkDeleteIsConfirming: boolean;
  rejectOpen: boolean;
  setRejectOpen: (v: boolean) => void;
  rejectReason: string;
  onRejectReasonChange: (v: string) => void;
  onReject: () => void;
  rejectIsConfirming: boolean;
}

export const HoursLogConfirmDialogs: React.FC<HoursLogConfirmDialogsProps> = ({
  deleteOpen,
  setDeleteOpen,
  deleteTitle,
  deleteDescription,
  onDelete,
  deleteIsConfirming,
  bulkDeleteOpen,
  setBulkDeleteOpen,
  selectedCount,
  onBulkDelete,
  bulkDeleteIsConfirming,
  rejectOpen,
  setRejectOpen,
  rejectReason,
  onRejectReasonChange,
  onReject,
  rejectIsConfirming,
}) => (
  <>
    <DeleteConfirmDialog
      open={deleteOpen}
      onOpenChange={setDeleteOpen}
      title={deleteTitle}
      description={deleteDescription}
      onConfirm={onDelete}
      isConfirming={deleteIsConfirming}
    />
    <BulkDeleteConfirmDialog
      open={bulkDeleteOpen}
      onOpenChange={setBulkDeleteOpen}
      selectedCount={selectedCount}
      onConfirm={onBulkDelete}
      isConfirming={bulkDeleteIsConfirming}
    />
    <RejectConfirmDialog
      open={rejectOpen}
      onOpenChange={setRejectOpen}
      rejectReason={rejectReason}
      onRejectReasonChange={onRejectReasonChange}
      onConfirm={onReject}
      isConfirming={rejectIsConfirming}
    />
  </>
);
