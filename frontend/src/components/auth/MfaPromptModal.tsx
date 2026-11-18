import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Fingerprint, ShieldAlert, ShieldCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { MFA_STATUS_KEY as STATUS_KEY } from "@/services/mfaKeys";
import { mfaService } from "@/services/mfaService";
import { isPasskeySupported } from "@/services/passkeyService";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const snoozeKey = (userId: number) => `mfa_prompt_dismissed:${userId}`;

const readSnoozed = (key: string | null) => {
  try {
    return !!key && sessionStorage.getItem(key) === "true";
  } catch {
    return false;
  }
};

/**
 * Logon prompt for an account without a second factor. Snoozing lasts for the browser session only,
 * so it comes back at the next sign-in until two-factor is on.
 */
export const MfaPromptModal: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const { data } = useQuery({ queryKey: STATUS_KEY, queryFn: mfaService.status, enabled: !!user });

  const key = user ? snoozeKey(user.id) : null;
  const [snoozedKey, setSnoozedKey] = useState<string | null>(null);

  const snooze = () => {
    if (!key) return;
    try {
      sessionStorage.setItem(key, "true");
    } catch {
      // Storage blocked: the in-memory flag still silences it until the page reloads.
    }
    setSnoozedKey(key);
  };

  // `enrolled` counts a passkey as well as the authenticator app; older servers only send `enabled`.
  const open =
    !!user &&
    (data?.enrolled ?? data?.enabled) === false &&
    pathname !== "/settings" &&
    snoozedKey !== key &&
    !readSnoozed(key);
  if (!open) return null;

  const passkeys = isPasskeySupported();
  const goTo = (state: { openMfaSetup: true } | { openPasskeySetup: true }) => {
    snooze();
    navigate("/settings", { state });
  };

  return (
    <Dialog open onOpenChange={(next) => !next && snooze()}>
      <DialogContent size="sm">
        <DialogHeader>
          <div className="bg-tone-warning-surface text-tone-warning-text border-tone-warning-border mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full border">
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          </div>
          <DialogTitle className="text-center">Two-factor authentication is required</DialogTitle>
          <DialogDescription className="text-center">
            To protect employee, payroll and client data, every account must use two-factor
            authentication.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ul className="border-border/60 bg-surface-sunken text-muted-foreground space-y-2 rounded-lg border p-3 text-sm">
            <li className="flex items-start gap-2.5">
              <ShieldCheck
                className="text-tone-success-text mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              Your account stays safe even if your password is stolen.
            </li>
            <li className="flex items-start gap-2.5">
              <ShieldCheck
                className="text-tone-success-text mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              Works with Google Authenticator, Microsoft Authenticator or 1Password.
            </li>
          </ul>
          <p className="text-muted-foreground mt-3 text-center text-xs">
            {passkeys
              ? "A passkey takes a few seconds: your device asks for Face ID, your fingerprint or your PIN. An authenticator app takes about two minutes and ends with backup codes."
              : "Setup takes about two minutes and ends with a set of backup codes."}
          </p>
        </DialogBody>
        <DialogFooter className={passkeys ? "sm:flex-col sm:space-x-0 [&>button]:w-full" : undefined}>
          <Button variant="ghost" onClick={snooze}>
            Remind me later
          </Button>
          {passkeys ? (
            <>
              <Button variant="outline" onClick={() => goTo({ openMfaSetup: true })}>
                Use an authenticator app
              </Button>
              <Button onClick={() => goTo({ openPasskeySetup: true })}>
                <Fingerprint className="mr-2 h-4 w-4" aria-hidden="true" />
                Set up Face ID or fingerprint
              </Button>
            </>
          ) : (
            <Button onClick={() => goTo({ openMfaSetup: true })}>
              Set up two-factor now
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
