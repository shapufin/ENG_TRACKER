import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fingerprint } from "lucide-react";
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
import { MFA_STATUS_KEY } from "@/services/mfaKeys";
import { mfaErrorMessage, mfaService } from "@/services/mfaService";
import {
  PasskeyCancelledError,
  isPasskeySupported,
  registerPasskey,
  removePasskey,
  renamePasskey,
} from "@/services/passkeyService";
import type { Passkey } from "@/types";
import { SecurityRow } from "./SecurityRow";

type Action = { kind: "add" } | { kind: "rename"; passkey: Passkey } | { kind: "remove"; passkey: Passkey };

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

const COPY = {
  add: {
    title: "Add a passkey",
    description: "Use Face ID, your fingerprint or your device PIN instead of typing a code.",
    submit: "Add passkey",
    busy: "Waiting for your device...",
  },
  rename: {
    title: "Rename passkey",
    description: "Pick a name you will recognise, such as the device it lives on.",
    submit: "Save name",
    busy: "Saving...",
  },
  remove: {
    title: "Remove passkey",
    description: "This device will no longer sign in with it. You can add it again later.",
    submit: "Remove passkey",
    busy: "Removing...",
  },
} as const;

const PasskeyDialog = ({
  action,
  appOn,
  onClose,
}: {
  action: Action;
  /** An authenticator app is on, so rename and remove also need a current code. */
  appOn: boolean;
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();
  const initialName = action.kind === "add" ? "This device" : action.kind === "rename" ? action.passkey.name : "";
  const [name, setName] = useState(initialName);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const copy = COPY[action.kind];
  const needsCode = appOn && action.kind !== "add";

  const run = useMutation({
    mutationFn: async () => {
      if (action.kind === "add") await registerPasskey(password, name);
      else if (action.kind === "rename") await renamePasskey(action.passkey.id, name, password, code);
      else await removePasskey(action.passkey.id, password, code);
    },
    onSuccess: () => {
      toast.success(
        action.kind === "add" ? "Passkey added" : action.kind === "rename" ? "Passkey renamed" : "Passkey removed"
      );
      queryClient.invalidateQueries({ queryKey: MFA_STATUS_KEY });
      onClose();
    },
    onError: (err: unknown) => {
      setCode("");
      if (err instanceof PasskeyCancelledError) {
        setError("The prompt was closed before it finished. Try again when you are ready.");
      } else if (err instanceof DOMException && err.name === "InvalidStateError") {
        setError("This device already has a passkey for your account.");
      } else {
        setError(mfaErrorMessage(err));
      }
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
                  <Label htmlFor="passkey-name">Name</Label>
                  <Input
                    id="passkey-name"
                    value={name}
                    maxLength={64}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="passkey-password">Password</Label>
                <Input
                  id="passkey-password"
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={error && !needsCode ? true : undefined}
                  aria-describedby={error && !needsCode ? "passkey-error" : undefined}
                  required
                />
              </div>
              {needsCode && (
                <MfaCodeField
                  id="passkey-code"
                  label="Code from your authenticator app"
                  value={code}
                  onChange={setCode}
                  error={error}
                />
              )}
              {error && !needsCode && (
                <p id="passkey-error" role="alert" className="text-destructive text-sm">
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

/** The Security block's passkey row: what is registered, and add, rename and remove. */
export const PasskeysSection: React.FC = () => {
  const { data } = useQuery({ queryKey: MFA_STATUS_KEY, queryFn: mfaService.status });
  const [action, setAction] = useState<Action | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const supported = isPasskeySupported();
  const isMobile = useIsMobile();
  const passkeys = data?.passkeys ?? [];

  // The logon prompt sends people here with the add dialog open.
  const wantsAdd = (location.state as { openPasskeySetup?: boolean } | null)?.openPasskeySetup;
  const ready = !!data && supported;
  useEffect(() => {
    if (!wantsAdd || !ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAction({ kind: "add" });
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
  }, [wantsAdd, ready, navigate, location.pathname, location.search]);

  // Nothing to add on this browser and nothing registered: a row that can do nothing is noise.
  if (!data || (!supported && passkeys.length === 0)) return null;

  const has = passkeys.length > 0;
  // One lead action per screen: on a phone, setting the phone up comes first.
  const phoneLeads = isMobile && !!data.phone_approval;
  return (
    <div id="passkeys">
      <SecurityRow
        tone={has ? "success" : "neutral"}
        icon={<Fingerprint />}
        title="Passkeys"
        status={<Badge variant={has ? "default" : "secondary"}>{has ? `${passkeys.length} added` : "None"}</Badge>}
        hint={
          data.phone_approval
            ? "Sign in on this device with Face ID, your fingerprint or your PIN. Phones are listed under Phone approval."
            : "Sign in with Face ID, your fingerprint or your device PIN. No code to type."
        }
        actions={
          supported && (
            <Button
              size="control-sm"
              variant={has || phoneLeads ? "outline" : "default"}
              onClick={() => setAction({ kind: "add" })}
            >
              Add a passkey
            </Button>
          )
        }
      >
        {has && (
          <ul className="mt-2 divide-y text-sm">
            {passkeys.map((passkey) => (
              <li key={passkey.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate font-medium">{passkey.name}</p>
                  <p className="text-xs opacity-80">
                    Added {formatDay(passkey.created_at)} ·{" "}
                    {passkey.last_used_at ? `Last used ${formatDay(passkey.last_used_at)}` : "Never used"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="control-sm"
                  aria-label={`Rename passkey ${passkey.name}`}
                  onClick={() => setAction({ kind: "rename", passkey })}
                >
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  size="control-sm"
                  aria-label={`Remove passkey ${passkey.name}`}
                  onClick={() => setAction({ kind: "remove", passkey })}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SecurityRow>
      {action && (
        <PasskeyDialog
          key={action.kind === "add" ? "add" : `${action.kind}-${action.passkey.id}`}
          action={action}
          appOn={data.enabled}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  );
};
