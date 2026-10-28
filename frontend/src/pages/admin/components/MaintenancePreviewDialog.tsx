import React from "react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MaintenancePage } from "@/components/maintenance/MaintenancePage";
import type { MaintenanceStatus } from "@/types";

interface MaintenancePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The unsaved draft, so the admin previews what they are about to publish. */
  status: MaintenanceStatus;
}

/** Live preview of the public maintenance screen, using the current draft. */
export const MaintenancePreviewDialog: React.FC<MaintenancePreviewDialogProps> = ({
  open,
  onOpenChange,
  status,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent size="xl">
      <DialogHeader>
        <DialogTitle>Maintenance screen preview</DialogTitle>
        <DialogDescription>
          This is exactly what everyone except staff admins sees while maintenance is on. The
          countdown uses the expected end above.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <MaintenancePage status={status} variant="preview" />
      </DialogBody>
    </DialogContent>
  </Dialog>
);
