import { useState } from "react";

export interface CustomDateRange {
  from: string;
  to: string;
}

export const useHoursLogPageState = () => {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange | null>(null);

  const openDelete = (id: number) => {
    setDeletingId(id);
    setDeleteOpen(true);
  };
  const handleRejectClick = (id: number) => {
    setRejectingId(id);
    setRejectOpen(true);
  };

  return {
    deleteOpen,
    setDeleteOpen,
    deletingId,
    setDeletingId,
    rejectOpen,
    setRejectOpen,
    rejectingId,
    setRejectingId,
    rejectReason,
    setRejectReason,
    rowSelection,
    setRowSelection,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    customDateRange,
    setCustomDateRange,
    openDelete,
    handleRejectClick,
  };
};
