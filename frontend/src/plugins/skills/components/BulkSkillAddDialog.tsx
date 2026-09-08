import React, { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Skill, SkillCategory } from "../types/skills";

export interface BulkSkillDraft {
  name: string;
  category: number;
}

export interface BulkSkillAddResult {
  failedRows: { index: number; name: string; message: string }[];
}

interface BulkSkillAddDialogProps {
  open: boolean;
  category: SkillCategory | null;
  existingSkills: Skill[];
  isSubmitting: boolean;
  errorMessage?: string;
  onClose: () => void;
  onSubmit: (rows: BulkSkillDraft[]) => Promise<BulkSkillAddResult | void> | void;
}

type Row = { id: number; name: string; error?: string };

const emptyRow = (id: number): Row => ({ id, name: "" });

export const BulkSkillAddDialog: React.FC<BulkSkillAddDialogProps> = ({
  open,
  category,
  existingSkills,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}) => {
  const [rows, setRows] = useState<Row[]>([emptyRow(0)]);
  const [validationError, setValidationError] = useState<string>();
  const nextId = useRef(1);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows([emptyRow(0)]);
      nextId.current = 1;
      setValidationError(undefined);
    }
  }, [open]);

  const updateRow = (rowId: number, patch: Partial<Row>) => {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, ...patch, error: undefined } : row))
    );
  };

  const handleSubmit = async () => {
    if (!category) return;
    const names = new Set(existingSkills.map((skill) => skill.name.trim().toLowerCase()));
    for (const row of rows) {
      const name = row.name.trim().toLowerCase();
      if (!name) return setValidationError("Every row needs a name.");
      if (names.has(name)) return setValidationError("A skill with this name already exists.");
      names.add(name);
    }
    setValidationError(undefined);
    const drafts = rows.map((row) => ({
      name: row.name.trim(),
      category: category.id,
    }));
    const result = await onSubmit(drafts);
    if (result && result.failedRows.length > 0) {
      const failedByIndex = new Map(result.failedRows.map((f) => [f.index, f]));
      const kept: Row[] = [];
      drafts.forEach((draft, index) => {
        const failed = failedByIndex.get(index);
        if (failed) {
          const id = nextId.current;
          nextId.current += 1;
          kept.push({ id, name: failed.name, error: failed.message });
        }
      });
      setRows(kept);
    }
  };

  const hasRowErrors = rows.some((row) => row.error);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add skills to {category?.name ?? "category"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Enter several catalog items at once. Name is auto-uppercased; code is generated
            automatically. Successful rows are saved individually.
          </p>
        </DialogHeader>
        {(validationError || errorMessage) && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {validationError ?? errorMessage}
          </p>
        )}
        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          <div className="hidden grid-cols-[minmax(0,1fr)_44px] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
            <span>Name</span>
            <span />
          </div>
          {rows.map((row, index) => (
            <div
              key={row.id}
              className="grid gap-2 rounded-md border border-border/70 p-2 sm:grid-cols-[minmax(0,1fr)_44px] sm:border-0 sm:p-0"
            >
              <div className="space-y-1">
                <Label className="sr-only" htmlFor={`bulk-name-${row.id}`}>
                  Skill name {index + 1}
                </Label>
                <Input
                  id={`bulk-name-${row.id}`}
                  value={row.name}
                  onChange={(event) =>
                    updateRow(row.id, { name: event.target.value.toUpperCase() })
                  }
                  placeholder="SKILL NAME"
                  aria-invalid={row.error ? true : undefined}
                />
                {row.error && (
                  <p role="alert" className="text-xs text-destructive">
                    {row.name}: {row.error}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-destructive"
                onClick={() =>
                  setRows((current) =>
                    current.length === 1 ? current : current.filter((r) => r.id !== row.id)
                  )
                }
                aria-label={`Remove row ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => {
            const id = nextId.current;
            nextId.current += 1;
            setRows((current) => [...current, emptyRow(id)]);
          }}
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add row
        </Button>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !category || hasRowErrors}
          >
            {isSubmitting ? "Adding..." : `Add ${rows.length} skill${rows.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
