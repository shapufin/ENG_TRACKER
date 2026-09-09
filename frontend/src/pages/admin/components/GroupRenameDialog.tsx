import React from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface GroupRenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingGroup: string | null;
  newGroupName: string;
  onNewGroupNameChange: (value: string) => void;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export const GroupRenameDialog: React.FC<GroupRenameDialogProps> = ({
  open,
  onOpenChange,
  editingGroup,
  newGroupName,
  onNewGroupNameChange,
  isSubmitting,
  onSubmit,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="shrink-0">
          <DialogTitle>Edit Calendar Group</DialogTitle>
          <DialogDescription>
            Rename the calendar group. This will update all teams with this group.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-1">
            <div>
              <Label htmlFor="group-rename-current">Current Group Name</Label>
              <Input id="group-rename-current" value={editingGroup || ""} disabled />
            </div>
            <div>
              <Label htmlFor="group-rename-new">New Group Name</Label>
              <Input
                id="group-rename-new"
                value={newGroupName}
                onChange={(e) => onNewGroupNameChange(e.target.value)}
                placeholder="Enter new group name"
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Renaming..." : "Rename Group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
