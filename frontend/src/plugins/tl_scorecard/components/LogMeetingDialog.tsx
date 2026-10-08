import React, { useEffect, useState } from "react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { FormDialog } from "@/components/ui/FormDialog";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { userService } from "@/services/userService";
import type { Meeting, MeetingKind } from "../types/tlScorecard";
import { OptionSelect, type SelectOption } from "./MemberSelectField";

type MeetingType = MeetingKind;

interface LogMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: {
    meeting_type: MeetingType;
    counterparty: number | null;
    team: number | null;
    occurred_on: string;
    notes: string;
    reference_url?: string;
  }) => Promise<void>;
  /** In edit mode type, counterparty and team are fixed; `onCreate` receives the edited values. */
  mode?: "create" | "edit";
  initial?: Meeting;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const LogMeetingDialog: React.FC<LogMeetingDialogProps> = ({
  open,
  onOpenChange,
  onCreate,
  mode = "create",
  initial,
}) => {
  const isEdit = mode === "edit";
  const { user } = useAuth();
  const [meetingType, setMeetingType] = useState<MeetingType>(
    initial?.meeting_type ?? "one_on_one"
  );
  const [counterpartyId, setCounterpartyId] = useState<number | null>(
    initial?.counterparty ?? null
  );
  const [teamId, setTeamId] = useState<number | null>(
    initial?.team ?? user?.teams?.[0]?.id ?? null
  );
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [occurredOn, setOccurredOn] = useState(initial?.occurred_on ?? todayIso());
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [referenceUrl, setReferenceUrl] = useState(initial?.reference_url ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const needsCounterparty = meetingType === "one_on_one" || meetingType === "tl_sync";
  const needsTeam = meetingType === "team_meeting";
  const teams = user?.teams ?? [];

  // A one-on-one is with someone on your team; a TL sync is with an Italy team leader.
  useEffect(() => {
    if (!open || isEdit || !needsCounterparty) return;
    let cancelled = false;
    const load: Promise<SelectOption[]> =
      meetingType === "one_on_one"
        ? userService
            .getMyTeamMembers()
            .then((profiles) =>
              profiles.map((p) => ({ id: p.user.id, label: p.user.full_name || p.user.username }))
            )
        : userService
            .getItalianTeamLeaders()
            .then((leaders) =>
              leaders.map((l) => ({ id: l.id, label: l.full_name || l.username }))
            );
    load
      .then((loaded) => {
        if (!cancelled) {
          setOptions(loaded);
          setLoadError(null);
        }
      })
      .catch(() => {
        if (!cancelled)
          setLoadError("Could not load the list of people. Close this dialog and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, isEdit, needsCounterparty, meetingType]);

  const canSubmit =
    occurredOn &&
    (!needsCounterparty || counterpartyId !== null) &&
    (!needsTeam || teamId !== null);

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
        reference_url: referenceUrl.trim(),
      });
      if (!isEdit) {
        setNotes("");
        setCounterpartyId(null);
        setReferenceUrl("");
      }
      onOpenChange(false);
    } catch {
      // The caller reports the failure; keep the dialog open for a retry.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit meeting" : "Log a meeting"}
      description="Logs a 1-on-1, TL sync or team meeting — private notes stay visible only to you and staff."
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel={isEdit ? "Save changes" : "Log meeting"}
      submitDisabled={!canSubmit}
      size="md"
    >
      <div className="space-y-4">
        {isEdit ? (
          <InfoCallout
            tone="neutral"
            label={
              <span className="text-muted-foreground">
                With:{" "}
                <span className="text-foreground font-medium">
                  {initial?.counterparty_name ?? "Whole team"}
                </span>
              </span>
            }
          />
        ) : (
          <>
            <div className="space-y-2">
              <FieldLabel htmlFor="meeting-type" required>
                Type
              </FieldLabel>
              <Select
                value={meetingType}
                onValueChange={(v) => {
                  setMeetingType(v as MeetingType);
                  setCounterpartyId(null);
                  setOptions([]);
                }}
              >
                <SelectTrigger id="meeting-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_on_one">1-on-1</SelectItem>
                  <SelectItem value="tl_sync">TL sync (Technical Lead in Italy)</SelectItem>
                  <SelectItem value="team_meeting">Team meeting</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {needsCounterparty && (
              <div className="space-y-2">
                <FieldLabel htmlFor="meeting-counterparty" required>
                  {meetingType === "one_on_one" ? "Team member" : "Italy team leader"}
                </FieldLabel>
                <OptionSelect
                  id="meeting-counterparty"
                  value={counterpartyId}
                  options={options}
                  placeholder={
                    meetingType === "one_on_one"
                      ? "Select a team member..."
                      : "Select a team leader..."
                  }
                  onChange={setCounterpartyId}
                />
                {loadError && (
                  <p role="alert" className="text-tone-danger-text mt-1 text-xs">
                    {loadError}
                  </p>
                )}
              </div>
            )}

            {needsTeam && teams.length > 1 && (
              <div className="space-y-2">
                <FieldLabel htmlFor="meeting-team" required>
                  Team
                </FieldLabel>
                <OptionSelect
                  id="meeting-team"
                  value={teamId}
                  options={teams.map((t) => ({ id: t.id, label: t.name }))}
                  placeholder="Select a team..."
                  onChange={setTeamId}
                />
              </div>
            )}
            {needsTeam && teams.length === 0 && (
              <p role="alert" className="text-tone-danger-text text-xs">
                You are not assigned to a team, so a team meeting cannot be logged.
              </p>
            )}
          </>
        )}

        <div className="space-y-2">
          <FieldLabel htmlFor="meeting-date" required>
            Date
          </FieldLabel>
          <Input
            id="meeting-date"
            type="date"
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="meeting-notes">Notes</FieldLabel>
          <Textarea
            id="meeting-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What was discussed..."
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel htmlFor="meeting-reference">Reference link</FieldLabel>
          <Input
            id="meeting-reference"
            type="url"
            value={referenceUrl}
            onChange={(e) => setReferenceUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>
    </FormDialog>
  );
};
