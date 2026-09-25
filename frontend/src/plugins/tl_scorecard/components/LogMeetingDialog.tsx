import React, { useEffect, useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { userService } from "@/services/userService";
import type { UserProfile } from "@/types";

export type MeetingType = "one_on_one" | "tl_sync" | "team_meeting";

interface LogMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: {
    meeting_type: MeetingType;
    counterparty: number | null;
    team: number | null;
    occurred_on: string;
    notes: string;
  }) => Promise<void>;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const LogMeetingDialog: React.FC<LogMeetingDialogProps> = ({ open, onOpenChange, onCreate }) => {
  const { user } = useAuth();
  const [meetingType, setMeetingType] = useState<MeetingType>("one_on_one");
  const [counterpartyId, setCounterpartyId] = useState<number | null>(null);
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    userService.getMyTeamMembers().then(setTeamMembers).catch(() => setTeamMembers([]));
  }, [open]);

  const teamId = user?.teams?.[0]?.id ?? null;
  const needsCounterparty = meetingType === "one_on_one" || meetingType === "tl_sync";
  const needsTeam = meetingType === "team_meeting";
  const canSubmit = occurredOn && (!needsCounterparty || counterpartyId !== null) && (!needsTeam || teamId !== null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onCreate({
        meeting_type: meetingType,
        counterparty: needsCounterparty ? counterpartyId : null,
        team: needsTeam ? teamId : null,
        occurred_on: occurredOn,
        notes,
      });
      setNotes("");
      setCounterpartyId(null);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Log a meeting"
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Log meeting"
      submitDisabled={!canSubmit}
      size="sm"
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="meeting-type">Type</Label>
          <select
            id="meeting-type"
            className="h-9 w-full rounded-xl border border-border bg-card px-2 text-sm text-foreground"
            value={meetingType}
            onChange={(e) => setMeetingType(e.target.value as MeetingType)}
          >
            <option value="one_on_one">1-on-1</option>
            <option value="tl_sync">TL sync (e.g. Technical Lead in Italy)</option>
            <option value="team_meeting">Team meeting</option>
          </select>
        </div>

        {needsCounterparty && (
          <div>
            <Label htmlFor="meeting-counterparty">
              {meetingType === "one_on_one" ? "Team member" : "Counterpart"}
            </Label>
            {meetingType === "one_on_one" ? (
              <select
                id="meeting-counterparty"
                className="h-9 w-full rounded-xl border border-border bg-card px-2 text-sm text-foreground"
                value={counterpartyId ?? ""}
                onChange={(e) => setCounterpartyId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Select a team member...</option>
                {teamMembers.map((profile) => (
                  <option key={profile.user.id} value={profile.user.id}>
                    {profile.user.full_name || profile.user.username}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id="meeting-counterparty"
                type="number"
                placeholder="User ID of the counterpart"
                value={counterpartyId ?? ""}
                onChange={(e) => setCounterpartyId(e.target.value ? Number(e.target.value) : null)}
              />
            )}
          </div>
        )}

        <div>
          <Label htmlFor="meeting-date">Date</Label>
          <Input
            id="meeting-date"
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="meeting-notes">Notes</Label>
          <Textarea
            id="meeting-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What was discussed..."
            rows={3}
          />
        </div>
      </div>
    </FormDialog>
  );
};
