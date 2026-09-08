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
      <DialogContent className="border-border bg-card">
        <DialogHeader>
          <DialogTitle>Edit Calendar Group</DialogTitle>
          <DialogDescription>
            Rename the calendar group. This will update all teams with this group.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <div className="space-y-4">
            <div>
              <Label>Current Group Name</Label>
              <Input value={editingGroup || ""} disabled />
            </div>
            <div>
              <Label>New Group Name</Label>
              <Input
                value={newGroupName}
                onChange={(e) => onNewGroupNameChange(e.target.value)}
                placeholder="Enter new group name"
              />
            </div>
          </div>
          <DialogFooter>
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
