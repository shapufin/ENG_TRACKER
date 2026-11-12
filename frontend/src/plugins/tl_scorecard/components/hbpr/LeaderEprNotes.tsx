import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HbprEprStageRow, HbprLeaderRow } from "../../types/tlScorecard";
import { formatDate } from "./hbprMeta";

const STAGE_LABELS: Record<HbprEprStageRow["stage"], string> = {
  goal_setting: "Goal setting",
  mid_year: "Mid-year",
  final_review: "Final review",
};

interface LeaderEprNotesProps {
  leader: HbprLeaderRow;
  year: number;
  className?: string;
}

/**
 * The leader's name as a button that opens a read-only list of the EPR stage notes
 * recorded for their team. It shows that a note exists, who wrote it and whether a
 * link is attached; the note text and the link itself are never sent to an HBPR.
 */
export const LeaderEprNotes: React.FC<LeaderEprNotesProps> = ({ leader, year, className }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        title={leader.name}
        onClick={() => setOpen(true)}
        className={className}
      >
        {leader.name}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {leader.name}: EPR notes {year}
            </DialogTitle>
            <DialogDescription>
              Shows whether a note was recorded for each stage. The note text and link stay with the
              Line Manager.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {leader.epr_stages.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No EPR stage notes recorded for {year}.
              </p>
            ) : (
              <ul className="space-y-2">
                {leader.epr_stages.map((row) => (
                  <li key={row.id} className="border-line-subtle rounded-lg border p-3">
                    <p className="text-sm font-medium">
                      {row.employee_name}: {STAGE_LABELS[row.stage]}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Note recorded {formatDate(row.recorded_on.slice(0, 10))} by{" "}
                      {row.recorded_by_name}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant={row.has_reference ? "success" : "secondary"}>
                        {row.has_reference ? "Link attached" : "No link"}
                      </Badge>
                      <Badge variant={row.shared_with_employee ? "success" : "secondary"}>
                        {row.shared_with_employee ? "Shared with employee" : "Not shared"}
                      </Badge>
                      {row.hbpr_present && <Badge variant="success">HBPR present</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
};
