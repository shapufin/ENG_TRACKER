import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DataTableActionsProps<T> {
  item: T;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
}

export const DataTableActions = <T,>({ item, onEdit, onDelete }: DataTableActionsProps<T>) => (
  <div className="flex gap-1">
    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => onEdit(item)}>
      <Pencil className="h-4 w-4" />
    </Button>
    <Button
      size="sm"
      variant="ghost"
      className="h-8 w-8 p-0 text-destructive"
      onClick={() => onDelete(item)}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  </div>
);
