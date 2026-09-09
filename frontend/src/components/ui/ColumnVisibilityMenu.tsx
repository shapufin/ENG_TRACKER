import { useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./dialog";
import { Label } from "./label";
import type { ColumnDef } from "@tanstack/react-table";

interface ColumnVisibilityMenuProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  visibility: Record<string, boolean>;
  onVisibilityChange: (visibility: Record<string, boolean>) => void;
}

export function ColumnVisibilityMenu<TData>({
  columns,
  visibility,
  onVisibilityChange,
}: ColumnVisibilityMenuProps<TData>) {
  const [open, setOpen] = useState(false);

  const handleToggle = (columnId: string, checked: boolean) => {
    onVisibilityChange({ ...visibility, [columnId]: checked });
  };

  const hideableColumns = useMemo(
    () =>
      columns.flatMap((col) => {
        const typedCol = col as { id?: string; accessorKey?: string; header?: unknown };
        const id = typedCol.id || typedCol.accessorKey;
        const header = col.header;
        const headerText =
          typeof header === "string" ? header : typedCol.accessorKey || typedCol.id;

        if (
          !id ||
          id === "select" ||
          header === undefined ||
          !headerText ||
          typeof headerText !== "string"
        )
          return [];
        return [{ id, label: headerText }];
      }),
    [columns]
  );

  const handleReset = () => {
    onVisibilityChange(Object.fromEntries(hideableColumns.map(({ id }) => [id, true])));
  };

  const visibleCount = hideableColumns.filter(({ id }) => visibility[id] ?? true).length;
  const totalCount = hideableColumns.length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2">
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">
            Columns ({visibleCount}/{totalCount})
          </span>
          <span className="sm:hidden">Columns</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[300px]">
        <DialogHeader>
          <DialogTitle>Toggle Columns</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <div className="no-scrollbar max-h-[300px] space-y-2 overflow-y-auto">
            {hideableColumns.map(({ id, label }) => (
              <div key={id} className="flex items-center space-x-2">
                <Checkbox
                  id={`col-${id}`}
                  checked={visibility[id] ?? true}
                  onCheckedChange={(checked) => handleToggle(id, checked as boolean)}
                />
                <Label
                  htmlFor={`col-${id}`}
                  className="cursor-pointer truncate text-sm"
                  title={label}
                >
                  {label}
                </Label>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-full text-xs" onClick={handleReset}>
            Reset to Defaults
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
