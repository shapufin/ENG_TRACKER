import React from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertTriangle, X } from "lucide-react";
import { ConflictCard } from "./ConflictCard";

export interface ConflictEntry {
  date: string;
  description: string;
  users: Array<{
    id: number;
    name: string;
    type: "vacation" | "sick";
    status: "pending" | "approved" | "rejected";
  }>;
}

interface ConflictsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: ConflictEntry[];
}

export const ConflictsModal: React.FC<ConflictsModalProps> = ({
  open,
  onOpenChange,
  conflicts,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      size="lg"
      hideClose
      padded={false}
      className="pointer-events-auto max-h-[80vh] sm:max-h-[80vh]"
    >
      <DialogTitle className="sr-only">All Conflicts</DialogTitle>
      <DialogDescription className="sr-only">
        View all scheduling conflicts for the current month
      </DialogDescription>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.15),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.10),transparent_25%)]" />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 p-6 pb-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="bg-tone-danger-surface flex h-12 w-12 items-center justify-center rounded-2xl">
                  <AlertTriangle className="text-tone-danger-text h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">All Conflicts</h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""} this month
                  </p>
                </div>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground flex h-11 w-11 items-center justify-center rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </div>
          </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {conflicts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="bg-tone-success-surface mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                  <AlertTriangle className="text-tone-success-text h-8 w-8" />
                </div>
                <h3 className="text-lg font-medium">No conflicts</h3>
                <p className="text-muted-foreground mt-2 text-sm">
                  All days have adequate staffing coverage
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {conflicts.map((conflict) => (
                  <ConflictCard key={conflict.date} conflict={conflict} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);
