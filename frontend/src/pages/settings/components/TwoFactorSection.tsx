import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BackupCodesPanel } from "@/components/auth/BackupCodesPanel";
import { MfaCodeField } from "@/components/auth/MfaCodeField";
import { MfaEnrollment } from "@/components/auth/MfaEnrollment";
import { mfaErrorMessage, mfaService } from "@/services/mfaService";
import type { MfaSetupData } from "@/types";

const STATUS_KEY = ["mfa", "status"] as const;

const requiredReason = (by: "global" | "user" | null) =>
  by === "global"
    ? "Your organization requires two-factor authentication for everyone."
    : "An administrator requires two-factor authentication for your account.";

/** Turn on: password, then scan + first code, then the one-time backup codes. */
const EnableDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"password" | "enroll" | "codes">("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<MfaSetupData | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep("password");
    setPassword("");
    setCode("");
    setSetup(null);
    setCodes([]);
    setAcknowledged(false);
    setError("");
  };

  const close = (next: boolean) => {
    // The backup codes are shown once: do not let a stray click or Escape dismiss them unsaved.
    if (!next && step === "codes" && !acknowledged) return;
    onOpenChange(next);
    if (!next) {
      if (step === "codes") queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      reset();
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (step === "password") {
        setSetup(await mfaService.setup(password));
        setPassword("");
        setStep("enroll");
      } else if (step === "enroll") {
        const result = await mfaService.activate(code);
        setCodes(result.backup_codes);
        setStep("codes");
        queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      } else {
        close(false); // the button is only enabled once the codes are acknowledged
      }
    } catch (err) {
      setCode("");
      setError(mfaErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const titles = {
    password: ["Turn on two-factor authentication", "Confirm your password to start."],
    enroll: ["Set up your authenticator", "Add this account to an authenticator app, then confirm."],
    codes: ["Save your backup codes", "Two-factor authentication is now on."],
  } as const;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        size="md"
        aria-describedby={undefined}
        // No close button while the codes are unsaved: Escape and outside clicks are blocked too.
        hideClose={step === "codes" && !acknowledged}
        onInteractOutside={(e) => step === "codes" && e.preventDefault()}
        onEscapeKeyDown={(e) => step === "codes" && !acknowledged && e.preventDefault()}
      >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{titles[step][0]}</DialogTitle>
            <DialogDescription>{titles[step][1]}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {step === "password" && (
              <div className="space-y-2">
                <Label htmlFor="mfa-enable-password">Password</Label>
                <Input
                  id="mfa-enable-password"
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "mfa-enable-password-error" : undefined}
                  required
                />
                {error && (
                  <p id="mfa-enable-password-error" role="alert" className="text-destructive text-sm">
                    {error}
                  </p>
                )}
              </div>
            )}
            {step === "enroll" && setup && (
              <MfaEnrollment setup={setup} code={code} onCodeChange={setCode} error={error} idPrefix="settings" />
            )}
            {step === "codes" && (
              <BackupCodesPanel
                codes={codes}
                acknowledged={acknowledged}
                onAcknowledgedChange={setAcknowledged}
                idPrefix="settings"
              />
            )}
          </DialogBody>
          <DialogFooter>
            {step !== "codes" && (
              <Button type="button" variant="outline" onClick={() => close(false)} disabled={busy}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={busy || (step === "codes" && !acknowledged)}>
              {step === "password" ? "Continue" : step === "enroll" ? "Turn on" : "Done"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/** Password + a current code, for the changes that would otherwise let a stolen session weaken the account. */
const StepUpDialog = ({
  mode,
  onOpenChange,
}: {
  mode: "disable" | "regenerate" | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const done = useMutation({
    mutationFn: async () => {
      if (mode === "disable") {
        await mfaService.disable(password, code);
        return null;
      }
      return (await mfaService.regenerateBackupCodes(password, code)).backup_codes;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      if (result) setCodes(result);
      else {
        toast.success("Two-factor authentication is off");
        close(false);
      }
    },
    onError: (err: unknown) => {
      setCode("");
      setError(mfaErrorMessage(err));
    },
  });

  const reset = () => {
    setPassword("");
    setCode("");
    setUseBackup(false);
    setError("");
    setCodes(null);
    setAcknowledged(false);
  };

  function close(next: boolean) {
    if (!next && codes && !acknowledged) return;
    onOpenChange(next);
    if (!next) reset();
  }

  const isDisable = mode === "disable";

  return (
    <Dialog open={mode !== null} onOpenChange={close}>
      <DialogContent
        size="sm"
        aria-describedby={undefined}
        hideClose={!!codes && !acknowledged}
        onInteractOutside={(e) => codes && !acknowledged && e.preventDefault()}
        onEscapeKeyDown={(e) => codes && !acknowledged && e.preventDefault()}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (codes) return close(false);
            setError("");
            done.mutate();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogHeader>
            <DialogTitle>
              {codes ? "Your new backup codes" : isDisable ? "Turn off two-factor authentication" : "New backup codes"}
            </DialogTitle>
            <DialogDescription>
              {codes
                ? "The old codes no longer work."
                : isDisable
                  ? "Your account will be protected by your password only."
                  : "This replaces your current codes."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {codes ? (
              <BackupCodesPanel
                codes={codes}
                acknowledged={acknowledged}
                onAcknowledgedChange={setAcknowledged}
                idPrefix="stepup"
              />
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="mfa-stepup-password">Password</Label>
                  <Input
                    id="mfa-stepup-password"
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <MfaCodeField
                  key={useBackup ? "backup" : "totp"}
                  id="mfa-stepup-code"
                  kind={useBackup ? "backup" : "totp"}
                  label={useBackup ? "Backup code" : "Code from your authenticator app"}
                  value={code}
                  onChange={setCode}
                  error={error}
                />
                <button
                  type="button"
                  className="text-primary hover:text-primary-hover inline-flex min-h-6 items-center text-sm underline-offset-4 hover:underline"
                  onClick={() => {
                    setUseBackup((v) => !v);
                    setCode("");
                    setError("");
                  }}
                >
                  {useBackup ? "Use my authenticator app instead" : "Use a backup code instead"}
                </button>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            {!codes && (
              <Button type="button" variant="outline" onClick={() => close(false)} disabled={done.isPending}>
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              variant={isDisable && !codes ? "destructive" : "default"}
              disabled={done.isPending || (!!codes && !acknowledged)}
            >
              {codes ? "Done" : done.isPending ? "Working..." : isDisable ? "Turn off" : "Generate codes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export const TwoFactorSection: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: STATUS_KEY, queryFn: mfaService.status });
  const [enableOpen, setEnableOpen] = useState(false);
  const [stepUp, setStepUp] = useState<"disable" | "regenerate" | null>(null);

  if (isLoading) return <LoadingCard rows={2} />;
  if (isError || !data) {
    return (
      <ErrorCard
        title="Could not load two-factor status"
        onRetry={() => queryClient.invalidateQueries({ queryKey: STATUS_KEY })}
      />
    );
  }

  const lowCodes = data.enabled && data.backup_codes_remaining <= 2;

  return (
    <GlassCard delay={0.05}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {data.enabled ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
          Two-factor authentication
          <Badge variant={data.enabled ? "default" : "secondary"} className="ml-auto">
            {data.enabled ? "On" : "Off"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {data.enabled
            ? "Sign-in asks for a code from your authenticator app after your password."
            : "Add a second step at sign-in with an authenticator app, so a stolen password alone is not enough."}
        </p>

        {data.required && !data.enabled && (
          <InfoCallout tone="warning" label={`${requiredReason(data.required_by)} Turn it on to keep signing in.`} />
        )}
        {data.required && data.enabled && (
          <InfoCallout tone="info" label={`${requiredReason(data.required_by)} It cannot be turned off.`} />
        )}
        {lowCodes && (
          <InfoCallout
            tone="warning"
            label="You are running low on backup codes."
            value={`${data.backup_codes_remaining} left`}
          />
        )}
        {data.enabled && !lowCodes && (
          <p className="text-muted-foreground text-xs">
            Backup codes left: <span className="text-foreground font-medium">{data.backup_codes_remaining}</span>
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!data.enabled && (
            <Button onClick={() => setEnableOpen(true)}>
              <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
              Turn on
            </Button>
          )}
          {data.enabled && (
            <>
              <Button variant="outline" onClick={() => setStepUp("regenerate")}>
                <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                New backup codes
              </Button>
              {!data.required && (
                <Button variant="outline" onClick={() => setStepUp("disable")}>
                  Turn off
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>

      {enableOpen && <EnableDialog open={enableOpen} onOpenChange={setEnableOpen} />}
      <StepUpDialog key={stepUp ?? "closed"} mode={stepUp} onOpenChange={(o) => !o && setStepUp(null)} />
    </GlassCard>
  );
};
