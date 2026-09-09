import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Trash2 } from "lucide-react";

export const DeleteRequestButton = ({
  id,
  onDelete,
}: {
  id: number;
  onDelete: (id: number) => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive"
        aria-label={`Delete request ${id}`}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete Request"
        description="Delete this request?"
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          setOpen(false);
          onDelete(id);
        }}
      />
    </>
  );
};
