import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useReducedMotion } from "framer-motion";
import { AlertTriangle, Eye, Power, Save, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { MAINTENANCE_STATUS_QUERY_KEY, useMaintenanceStatus } from "@/hooks/useMaintenanceStatus";
import { handleApiError } from "@/lib/error-handler";
import { maintenanceService, type MaintenanceUpdate } from "@/services/maintenanceService";
import type { MaintenanceStatus } from "@/types";
import { MaintenancePreviewDialog } from "./MaintenancePreviewDialog";

const TITLE_MAX = 120;
const MESSAGE_MAX = 600;

/** ISO → the `datetime-local` value in the browser's zone. */
const toLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
};

const formatSince = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

const MaintenanceCardBody: React.FC<{ status: MaintenanceStatus }> = ({ status }) => {
  const queryClient = useQueryClient();
  const shouldReduceMotion = useReducedMotion();
  const [pendingToggle, setPendingToggle] = useState<boolean | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [title, setTitle] = useState(status.title);
  const [message, setMessage] = useState(status.message);
  const [endsAt, setEndsAt] = useState(() => toLocalInput(status.ends_at));
  // Validation runs in the change handler, not during render (Date.now() is
  // impure and must not be read while rendering).
  const [endInPast, setEndInPast] = useState(false);

  const titleMissing = title.trim().length === 0;
  const canSave = !endInPast && !titleMissing;

  const save = useMutation({
    mutationFn: (payload: MaintenanceUpdate) => maintenanceService.update(payload),
    onSuccess: (data, payload) => {
      queryClient.setQueryData(MAINTENANCE_STATUS_QUERY_KEY, data);
      queryClient.invalidateQueries({ queryKey: MAINTENANCE_STATUS_QUERY_KEY });
      setPendingToggle(null);
      if (data.active) {
        toast.success("Maintenance mode is ON — users are locked out");
      } else {
        // Copy saved while the switch is off is staged, not discarded.
        toast.success(
          payload.is_active === undefined ? "Maintenance message saved" : "Maintenance mode is off"
        );
      }
    },
    onError: (err: unknown) => {
      handleApiError(err);
      setPendingToggle(null);
    },
  });

  const draft = useMemo<MaintenanceUpdate>(
    () => ({
      title: title.trim(),
      message: message.trim(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    }),
    [title, message, endsAt]
  );

  const previewStatus: MaintenanceStatus = {
    ...status,
    title: draft.title ?? "",
    message: draft.message ?? "",
    ends_at: draft.ends_at ?? null,
  };

  return (
    <GlassCard delay={0}>
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center gap-2 border-b pb-3">
          <Wrench className="text-primary h-5 w-5" aria-hidden="true" />
          <h3 className="text-base font-semibold">Maintenance mode</h3>
          <Badge
            variant={status.active ? "warning" : "secondary"}
            className="ml-auto flex items-center gap-1.5"
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${status.active ? "bg-warning" : "bg-muted-foreground"}`}
            />
            {status.active ? "Active — users locked out" : "Off"}
          </Badge>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="maintenance-toggle" className="text-sm font-semibold">
              Put the site into maintenance mode
            </Label>
            <p className="text-muted-foreground mt-0.5 text-xs">
              While on, every non-admin is locked out: sign-in, token refresh, reads and writes all
              answer 503. Staff admins keep working. Ending maintenance restores access immediately.
            </p>
          </div>
          <Switch
            id="maintenance-toggle"
            checked={status.active}
            disabled={save.isPending}
            onCheckedChange={(checked) => setPendingToggle(checked)}
          />
        </div>

        {status.active && (
          <div className="border-tone-warning-border bg-tone-warning-surface text-tone-warning-text flex items-start gap-3 rounded-lg border p-3 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              The platform is closed
              {formatSince(status.started_at) ? ` since ${formatSince(status.started_at)}` : ""}.
              {status.ends_at
                ? " It reopens by itself at the expected end, even if nobody switches it off."
                : " It stays closed until you switch it off — set an expected end as a safety net."}
            </span>
          </div>
        )}

        <div className="grid gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="maintenance-title">Headline</Label>
              <span className="text-muted-foreground font-mono text-xs">
                {title.length}/{TITLE_MAX}
              </span>
            </div>
            <Input
              id="maintenance-title"
              value={title}
              maxLength={TITLE_MAX}
              placeholder="Scheduled maintenance"
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={titleMissing || undefined}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="maintenance-message">Message</Label>
              <span className="text-muted-foreground font-mono text-xs">
                {message.length}/{MESSAGE_MAX}
              </span>
            </div>
            <Textarea
              id="maintenance-message"
              value={message}
              maxLength={MESSAGE_MAX}
              rows={4}
              placeholder="We're updating the platform…"
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="maintenance-ends-at">Expected end (optional)</Label>
            <Input
              id="maintenance-ends-at"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => {
                const value = e.target.value;
                setEndsAt(value);
                const parsed = value ? new Date(value) : null;
                setEndInPast(Boolean(parsed && parsed.getTime() <= Date.now()));
              }}
              aria-invalid={endInPast || undefined}
              aria-describedby="maintenance-ends-at-help"
            />
            <p
              id="maintenance-ends-at-help"
              className={endInPast ? "text-destructive text-xs" : "text-muted-foreground text-xs"}
            >
              {endInPast
                ? "The expected end must be in the future."
                : "Shown as a countdown on the maintenance screen. The site reopens by itself at this time."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button onClick={() => save.mutate(draft)} disabled={!canSave || save.isPending}>
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            Save message
          </Button>
          <Button variant="outline" onClick={() => setPreviewOpen(true)}>
            <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
            Preview
          </Button>
          <span className="text-muted-foreground ml-auto text-xs">
            {status.active
              ? "Edits apply to the live screen as soon as you save."
              : "Saved now and used when you switch maintenance on."}
          </span>
        </div>

        {!shouldReduceMotion && status.active && (
          <div aria-hidden="true" className="bg-muted h-1 w-full overflow-hidden rounded-full">
            <div className="bg-warning h-full w-1/3 rounded-full" />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingToggle !== null}
        onOpenChange={(open) => {
          if (!open) setPendingToggle(null);
        }}
        title={pendingToggle ? "Put the whole site into maintenance?" : "End maintenance mode?"}
        description={
          pendingToggle
            ? "Every non-admin will be signed out of the API immediately and shown the maintenance screen. Nobody can log overtime, standby, leave or calendar entries until you end it. Staff admins keep working. Your headline, message and expected end are saved with the switch."
            : "Everyone regains access immediately. Nobody has to reload by hand: tabs on the maintenance screen reload into the app by themselves."
        }
        confirmLabel={pendingToggle ? "Start maintenance" : "End maintenance"}
        variant={pendingToggle ? "destructive" : "default"}
        icon={<Power className="h-4 w-4" aria-hidden="true" />}
        isConfirming={save.isPending}
        onConfirm={() => {
          if (pendingToggle === null) return;
          save.mutate({ ...draft, is_active: pendingToggle });
        }}
      />

      <MaintenancePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        status={previewStatus}
      />
    </GlassCard>
  );
};

/** The Maintenance tab of Global Settings. */
export const MaintenanceControlCard: React.FC = () => {
  const { data, isLoading, isError, refetch } = useMaintenanceStatus();

  if (isLoading) return <LoadingCard rows={3} />;
  if (isError || !data) {
    return (
      <ErrorCard
        title="Failed to load maintenance state"
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  // Keyed on the server state so a save (or a poll from another tab) resets
  // the form to what is actually stored.
  return (
    <MaintenanceCardBody key={`${data.active}-${data.updated_at}-${data.ends_at}`} status={data} />
  );
};
