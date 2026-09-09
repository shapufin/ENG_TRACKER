import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AuditLog } from "@/services/auditService";

interface AuditLogDetailDialogProps {
  log: AuditLog | null;
  onClose: () => void;
}

export const AuditLogDetailDialog: React.FC<AuditLogDetailDialogProps> = ({ log, onClose }) => (
  <Dialog open={!!log} onOpenChange={onClose}>
    <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
      <DialogHeader className="shrink-0">
        <DialogTitle>Audit Log Details</DialogTitle>
        <DialogDescription>Detailed information about this audit log entry</DialogDescription>
      </DialogHeader>
      {log && (
        <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Timestamp</p>
              <p className="text-sm">{new Date(log.timestamp).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">User</p>
              <p className="text-sm">{log.user_name || "System"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Action</p>
              <p className="text-sm">{log.action_display || log.action}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Model</p>
              <p className="text-sm">{log.model_name_display || log.model_name}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Object</p>
            <p className="break-words text-sm">{log.object_repr || "N/A"}</p>
          </div>
          {log.changes_summary && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Changes Summary</p>
              <p className="break-words text-sm">{log.changes_summary}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">IP Address</p>
              <p className="font-mono text-sm">{log.ip_address || "N/A"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">User Agent</p>
              <p className="break-words text-sm text-muted-foreground">{log.user_agent || "N/A"}</p>
            </div>
          </div>
        </div>
      )}
    </DialogContent>
  </Dialog>
);
