import React from "react";
import { FlagAbsenceDialog } from "../FlagAbsenceDialog";
import { FlagIdleDialog } from "../FlagIdleDialog";
import { LogMeetingDialog } from "../LogMeetingDialog";
import { LogReviewDeliveryDialog } from "../LogReviewDeliveryDialog";
import { NominatePromotionDialog } from "../NominatePromotionDialog";
import { OpenPIPDialog } from "../OpenPIPDialog";
import type { Absence, IdleFlag, Meeting, PIPRecord, PromotionFlag, ReviewDelivery } from "../../types/tlScorecard";
import type { RecordKind, RecordRow } from "./recordKinds";

interface EditRecordDialogProps {
  kind: RecordKind;
  record: RecordRow;
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}

/** Re-uses each kind's create dialog in edit mode. Mounted only while editing, so it seeds from `record`. */
export const EditRecordDialog: React.FC<EditRecordDialogProps> = ({ kind, record, onClose, onSubmit }) => {
  const common = {
    open: true,
    mode: "edit" as const,
    onOpenChange: (open: boolean) => {
      if (!open) onClose();
    },
    onCreate: onSubmit,
  };
  switch (kind) {
    case "meetings":
      return <LogMeetingDialog {...common} initial={record as Meeting} />;
    case "idle":
      return <FlagIdleDialog {...common} initial={record as IdleFlag} />;
    case "absences":
      return <FlagAbsenceDialog {...common} initial={record as Absence} />;
    case "reviews":
      return <LogReviewDeliveryDialog {...common} initial={record as ReviewDelivery} />;
    case "promotions":
      return <NominatePromotionDialog {...common} initial={record as PromotionFlag} />;
    case "pips":
      return <OpenPIPDialog {...common} initial={record as PIPRecord} />;
  }
};
