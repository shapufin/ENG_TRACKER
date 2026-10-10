import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./dialog";
import { Label } from "./label";

export interface ColumnToggleItem {
  id: string;
  label: string;
}

interface ColumnToggleMenuProps {
  columns: ColumnToggleItem[];
  visibility: Record<string, boolean>;
  onVisibilityChange: (visibility: Record<string, boolean>) => void;
}

export function ColumnToggleMenu({
  columns,
  visibility,
  onVisibilityChange,
}: ColumnToggleMenuProps) {
  const [open, setOpen] = useState(false);

  const handleToggle = (columnId: string, checked: boolean) => {
    onVisibilityChange({ ...visibility, [columnId]: checked });
  };

  const handleReset = () => {
    onVisibilityChange(Object.fromEntries(columns.map(({ id }) => [id, true])));
  };

  const visibleCount = columns.filter(({ id }) => visibility[id] ?? true).length;
  const totalCount = columns.length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="control" className="gap-2">
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">
            Columns ({visibleCount}/{totalCount})
          </span>
          <span className="sm:hidden">Columns</span>
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Toggle Columns</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <div className="no-scrollbar max-h-[300px] space-y-2 overflow-y-auto">
            {columns.map(({ id, label }) => (
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
          <Button
            variant="ghost"
            size="control-sm"
            className="w-full text-xs"
            onClick={handleReset}
          >
            Reset to Defaults
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
