import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MfaCodeField } from "@/components/auth/MfaCodeField";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { MFA_STATUS_KEY } from "@/services/mfaKeys";
import { mfaErrorMessage, mfaService } from "@/services/mfaService";
import { PasskeyCancelledError, isPasskeySupported, registerPasskey } from "@/services/passkeyService";
import { currentPushEndpoint, pairPhone, removePhone, renamePhone } from "@/services/phoneApprovalService";
import type { PairedPhone } from "@/types";
import { SecurityRow } from "./SecurityRow";

type Action = { kind: "pair" } | { kind: "rename"; phone: PairedPhone } | { kind: "remove"; phone: PairedPhone };

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

const COPY = {
  pair: {
    title: "Set up this phone",
    description:
      "Create a passkey on this phone so it can approve your sign-ins on a computer with your fingerprint or face.",
    submit: "Set up phone",
    busy: "Setting up...",
  },
  rename: {
    title: "Rename phone",
    description: "Pick a name you will recognise.",
    submit: "Save name",
    busy: "Saving...",
  },
  remove: {
    title: "Remove phone",
    description: "This phone will no longer approve sign-ins. Its passkey stays under Passkeys.",
    submit: "Remove phone",
    busy: "Removing...",
  },
} as const;

const PhoneDialog = ({ action, appOn, onClose }: { action: Action; appOn: boolean; onClose: () => void }) => {
  const queryClient = useQueryClient();
  const push = usePushNotifications();
  const initialName = action.kind === "pair" ? "This phone" : action.kind === "rename" ? action.phone.name : "";
  const [name, setName] = useState(initialName);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const copy = COPY[action.kind];
  const needsCode = appOn; // every change here re-proves the password and, with an app on, a code

  const run = useMutation({
    mutationFn: async () => {
      if (action.kind === "rename") return void (await renamePhone(action.phone.id, name, password, code));
      if (action.kind === "remove") return void (await removePhone(action.phone.id, password, code));

      const passkey = await registerPasskey(password, name);
      let pushEndpoint = "";
      if (push.pushAvailability === "available") {
        const allowed = push.permission === "granted" || (await push.requestPermission());
        if (allowed && (await push.subscribe())) pushEndpoint = await currentPushEndpoint();
      }
      await pairPhone({ password, code, credentialId: passkey.id, name, pushEndpoint });
      if (!pushEndpoint) {
        toast.message("Phone set up without notifications. Sign-ins will show a QR code to scan with its camera.");
      }
    },
    onSuccess: () => {
      toast.success(
        action.kind === "pair" ? "Phone set up" : action.kind === "rename" ? "Phone renamed" : "Phone removed"
      );
      queryClient.invalidateQueries({ queryKey: MFA_STATUS_KEY });
      onClose();
    },
    onError: (err: unknown) => {
      setCode("");
      if (err instanceof PasskeyCancelledError) {
        setError("The prompt was closed before it finished. Try again when you are ready.");
      } else if (err instanceof DOMException && err.name === "InvalidStateError") {
        setError(
          "This phone already has a passkey for your account. Remove it under Passkeys, then set up the phone again."
        );
      } else {
        setError(mfaErrorMessage(err));
      }
      queryClient.invalidateQueries({ queryKey: MFA_STATUS_KEY });
    },
  });

  return (
    <Dialog open onOpenChange={(next) => !next && !run.isPending && onClose()}>
      <DialogContent size="sm" aria-describedby={undefined}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            run.mutate();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              {action.kind !== "remove" && (
                <div className="space-y-2">
                  <Label htmlFor="phone-name">Name</Label>
                  <Input
                    id="phone-name"
                    value={name}
                    maxLength={64}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="phone-password">Password</Label>
                <Input
                  id="phone-password"
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={error && !needsCode ? true : undefined}
                  aria-describedby={error && !needsCode ? "phone-error" : undefined}
                  required
                />
              </div>
              {needsCode && (
                <MfaCodeField
                  id="phone-code"
                  label="Code from your authenticator app"
                  value={code}
                  onChange={setCode}
                  error={error}
                />
              )}
              {error && !needsCode && (
                <p id="phone-error" role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={run.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={action.kind === "remove" ? "destructive" : "default"}
              disabled={run.isPending}
            >
              {run.isPending ? copy.busy : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/** The Security block's phone-approval row: which phones can approve a sign-in, and set up, rename, remove. */
export const PairedPhonesSection: React.FC = () => {
  const { data } = useQuery({ queryKey: MFA_STATUS_KEY, queryFn: mfaService.status });
  const [action, setAction] = useState<Action | null>(null);
  const supported = isPasskeySupported();

  // Absent while the server switch is off: a row that can do nothing is noise.
  if (!data?.phone_approval) return null;

  const phones = data.phones ?? [];
  const has = phones.length > 0;
  return (
    <div id="phones">
      <SecurityRow
        tone={has ? "success" : "neutral"}
        icon={<Smartphone />}
        title="Phone approval"
        status={<Badge variant={has ? "default" : "secondary"}>{has ? `${phones.length} set up` : "None"}</Badge>}
        hint="Sign in on a computer by approving it on your phone with your fingerprint or face."
        actions={
          supported && (
            <Button size="control-sm" variant={has ? "outline" : "default"} onClick={() => setAction({ kind: "pair" })}>
              Set up this phone
            </Button>
          )
        }
      >
        {has && (
          <ul className="mt-2 divide-y text-sm">
            {phones.map((phone) => (
              <li key={phone.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate font-medium">{phone.name}</p>
                  <p className="text-xs opacity-80">
                    {phone.can_push ? "Notifications on" : "QR code only"} ·{" "}
                    {phone.last_used_at ? `Last used ${formatDay(phone.last_used_at)}` : "Never used"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="control-sm"
                  aria-label={`Rename phone ${phone.name}`}
                  onClick={() => setAction({ kind: "rename", phone })}
                >
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  size="control-sm"
                  aria-label={`Remove phone ${phone.name}`}
                  onClick={() => setAction({ kind: "remove", phone })}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SecurityRow>
      {action && (
        <PhoneDialog
          key={action.kind === "pair" ? "pair" : `${action.kind}-${action.phone.id}`}
          action={action}
          appOn={data.enabled}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  );
};
