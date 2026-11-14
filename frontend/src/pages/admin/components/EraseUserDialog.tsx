import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { handleApiError } from "@/lib/error-handler";
import { userService } from "@/services/userService";

interface EraseUserDialogProps {
  userId: number;
  username: string;
  onClose: () => void;
}

const total = (counts: Record<string, number>) =>
  Object.values(counts).reduce((sum, count) => sum + count, 0);

/**
 * Superuser override for a user the ordinary delete refuses. The server decides
 * what may be erased; this dialog shows its preview and collects the reason and
 * the typed phrase. Mount it only while open (it seeds no state from props).
 */
export const EraseUserDialog: React.FC<EraseUserDialogProps> = ({ userId, username, onClose }) => {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [phrase, setPhrase] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const { data: preview, isLoading } = useQuery({
    queryKey: ["admin", "user-erase-preview", userId],
    queryFn: () => userService.getErasePreview(userId),
    staleTime: 0,
  });

  const eraseMutation = useMutation({
    mutationFn: () =>
      userService.eraseUser(userId, {
        confirm: phrase,
        reason,
        acknowledge_other_people_records: acknowledged,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("User erased");
      onClose();
    },
    onError: (err) => handleApiError(err),
  });

  const othersCount = preview ? total(preview.about_other_people) : 0;
  const ready =
    Boolean(preview?.can_erase) &&
    phrase === preview?.confirm_phrase &&
    reason.trim().length >= (preview?.min_reason_length ?? 10) &&
    (othersCount === 0 || acknowledged);

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Erase user"
      description={`${username} has records, so an ordinary delete is refused. Erasing removes the account and those records for good and tells every superuser.`}
      onConfirm={() => eraseMutation.mutate()}
      isConfirming={eraseMutation.isPending}
      confirmDisabled={!ready}
      confirmLabel="Erase user"
      variant="destructive"
    >
      {isLoading || !preview ? (
        <p className="text-muted-foreground text-sm">Checking what would be erased…</p>
      ) : !preview.can_erase ? (
        <div className="bg-tone-danger-surface text-tone-danger-text space-y-2 rounded-lg p-3 text-sm">
          <p className="font-medium">This user cannot be erased yet.</p>
          <ul className="list-disc space-y-1 pl-5">
            {preview.reasons.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1 text-sm">
            <p className="font-medium">
              {total(preview.will_delete)} records will be erased with the account:
            </p>
            <ul className="text-muted-foreground list-disc space-y-0.5 pl-5">
              {Object.entries(preview.will_delete).map(([label, count]) => (
                <li key={label}>
                  {count} × {label}
                </li>
              ))}
            </ul>
          </div>
          {othersCount > 0 && (
            <div className="bg-tone-danger-surface text-tone-danger-text flex items-start gap-2 rounded-lg p-3 text-sm">
              <Checkbox
                id="erase-ack-others"
                checked={acknowledged}
                onCheckedChange={(value) => setAcknowledged(value === true)}
              />
              <Label htmlFor="erase-ack-others" className="leading-snug">
                {othersCount} of these records are about other people (written by this user as a
                leader). I understand they will be erased too.
              </Label>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="erase-reason">Reason (kept in the audit log)</Label>
            <Textarea
              id="erase-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="erase-phrase">
              Type <span className="font-mono">{preview.confirm_phrase}</span> to confirm
            </Label>
            <Input
              id="erase-phrase"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
      )}
    </ConfirmDialog>
  );
};
