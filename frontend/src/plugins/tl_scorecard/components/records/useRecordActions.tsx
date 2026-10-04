import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { tlScorecardService } from "../../services/tlScorecardService";
import { EditRecordDialog } from "./EditRecordDialog";
import { errorMessage } from "./errorMessage";
import { LogIdleStatusUpdateDialog } from "./LogIdleStatusUpdateDialog";
import { NoteActionDialog } from "./NoteActionDialog";
import { RecordDetailDialog } from "./RecordDetailDialog";
import type { IdleFlag } from "../../types/tlScorecard";
import type { KindConfig, RecordActionId, RecordRow, Viewer } from "./recordKinds";

interface NoteAction {
  title: string;
  fieldLabel: string;
  submitLabel: string;
  required: boolean;
  success: string;
  call: (id: number, note: string) => Promise<unknown>;
}

const NOTE_ACTIONS: Partial<Record<RecordActionId, NoteAction>> = {
  share: {
    title: "Share a summary",
    fieldLabel: "Summary for the team member",
    submitLabel: "Share summary",
    required: true,
    success: "Summary shared",
    call: (id, note) => tlScorecardService.shareMeeting(id, note),
  },
  reject: {
    title: "Return PIP to the team leader",
    fieldLabel: "Reason",
    submitLabel: "Return PIP",
    required: true,
    success: "PIP returned to the team leader",
    call: (id, note) => tlScorecardService.rejectPIPRecord(id, note),
  },
  cancel: {
    title: "Cancel PIP",
    fieldLabel: "Reason",
    submitLabel: "Cancel PIP",
    required: true,
    success: "PIP cancelled",
    call: (id, note) => tlScorecardService.cancelPIPRecord(id, note),
  },
  promote: {
    title: "Promote",
    fieldLabel: "Decision note (optional)",
    submitLabel: "Promote",
    required: false,
    success: "Marked as promoted",
    call: (id, decision_note) => tlScorecardService.decidePromotionFlag(id, { status: "promoted", decision_note }),
  },
  decline: {
    title: "Decline promotion",
    fieldLabel: "Decision note (optional)",
    submitLabel: "Decline",
    required: false,
    success: "Nomination declined",
    call: (id, decision_note) => tlScorecardService.decidePromotionFlag(id, { status: "declined", decision_note }),
  },
};

const ONE_CLICK: Partial<Record<RecordActionId, { success: string; call: (id: number) => Promise<unknown> }>> = {
  resolve: { success: "Marked resolved", call: (id) => tlScorecardService.resolveIdleFlag(id) },
  address: { success: "Marked addressed", call: (id) => tlScorecardService.addressAbsence(id) },
  approve: { success: "PIP approved", call: (id) => tlScorecardService.approvePIPRecord(id) },
  complete: { success: "PIP completed", call: (id) => tlScorecardService.completePIPRecord(id) },
};

interface Pending {
  action: RecordActionId;
  config: KindConfig<RecordRow>;
  record: RecordRow;
}

const INVALIDATED = ["records", "scorecard", "escalations", "pip-records"] as const;

/** Runs a record's state action and renders the dialogs that action needs. */
export const useRecordActions = (viewer: Viewer) => {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Pending | null>(null);
  const [detail, setDetail] = useState<Pick<Pending, "config" | "record"> | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const perform = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
    toast.success(success);
    await Promise.all(INVALIDATED.map((key) => queryClient.invalidateQueries({ queryKey: ["tl-scorecard", key] })));
  };

  const run = (action: RecordActionId, config: KindConfig<RecordRow>, record: RecordRow) => {
    const oneClick = ONE_CLICK[action];
    if (oneClick) {
      perform(() => oneClick.call(record.id), oneClick.success).catch(() => undefined);
      return;
    }
    setPending({ action, config, record });
  };

  const close = () => setPending(null);
  const noteAction = pending ? NOTE_ACTIONS[pending.action] : undefined;
  const view = (config: KindConfig<RecordRow>, record: RecordRow) => setDetail({ config, record });

  const dialogs = (
    <>
      {detail && (
        <RecordDetailDialog
          open
          config={detail.config}
          record={detail.record}
          viewer={viewer}
          onOpenChange={(open) => {
            if (!open) setDetail(null);
          }}
          onLogUpdate={(record) => {
            setDetail(null);
            setPending({ action: "log-update", config: detail.config, record });
          }}
        />
      )}
      {pending?.action === "log-update" && (
        <LogIdleStatusUpdateDialog
          key={pending.record.id}
          open
          flag={pending.record as IdleFlag}
          onOpenChange={(open) => {
            if (!open) close();
          }}
          onSubmit={(data) =>
            perform(
              () =>
                tlScorecardService.createIdleStatusUpdate({
                  flag: pending.record.id,
                  ...data,
                }),
              "Weekly update logged"
            )
          }
        />
      )}
      {pending?.action === "edit" && (
        <EditRecordDialog
          key={pending.record.id}
          kind={pending.config.key}
          record={pending.record}
          onClose={close}
          onSubmit={(data) =>
            perform(() => tlScorecardService.updateRecord(pending.config.resource, pending.record.id, data), "Changes saved")
          }
        />
      )}
      {pending?.action === "delete" && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && close()}
          title={`Delete ${pending.config.title(pending.record)}?`}
          description={`This ${pending.config.noun} will be removed from your records. This cannot be undone.`}
          variant="destructive"
          confirmLabel="Delete"
          isConfirming={isDeleting}
          onConfirm={async () => {
            setIsDeleting(true);
            try {
              await perform(
                () => tlScorecardService.deleteRecord(pending.config.resource, pending.record.id),
                `${pending.config.noun[0].toUpperCase()}${pending.config.noun.slice(1)} deleted`,
              );
              close();
            } catch {
              // Already reported; leave the dialog open so the user can retry or cancel.
            } finally {
              setIsDeleting(false);
            }
          }}
        />
      )}
      {pending && noteAction && (
        <NoteActionDialog
          key={`${pending.action}-${pending.record.id}`}
          open
          onOpenChange={(open) => !open && close()}
          title={noteAction.title}
          description={pending.config.title(pending.record)}
          fieldLabel={noteAction.fieldLabel}
          submitLabel={noteAction.submitLabel}
          required={noteAction.required}
          onSubmit={(note) => perform(() => noteAction.call(pending.record.id, note), noteAction.success)}
        />
      )}
    </>
  );

  return { run, view, dialogs };
};
