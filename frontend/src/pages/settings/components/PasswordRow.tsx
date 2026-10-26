import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/ui/FormDialog";
import { ModalSection } from "@/components/ui/ModalSection";
import { MfaCodeField } from "@/components/auth/MfaCodeField";
import { authService } from "@/services/authService";
import { mfaService } from "@/services/mfaService";
import { SecurityRow } from "./SecurityRow";

type ApiError = { response?: { data?: { detail?: string; error?: string; messages?: string[] } } };

/** Policy messages first (they say what to fix), then the server's own wording. */
const passwordErrorMessage = (error: unknown): string => {
  const data = (error as ApiError)?.response?.data;
  if (data?.messages?.length) return data.messages.join(" ");
  return data?.detail || data?.error || "Could not change the password. Try again.";
};

const EMPTY = { current: "", next: "", confirm: "", code: "" };

export const PasswordRow: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState("");
  // Same query key as the two-factor row, so this costs no extra request.
  const { data: mfa } = useQuery({ queryKey: ["mfa", "status"], queryFn: mfaService.status });
  const needsCode = mfa?.enabled === true;

  const change = useMutation({
    mutationFn: () =>
      authService.changePassword(form.current, form.next, needsCode ? form.code : undefined),
    onSuccess: () => {
      toast.success("Password updated. Your other devices were signed out.");
      close(false);
    },
    onError: (err: unknown) => {
      setForm((f) => ({ ...f, code: "" }));
      setError(passwordErrorMessage(err));
    },
  });

  function close(next: boolean) {
    setOpen(next);
    if (!next) {
      setForm(EMPTY);
      setUseBackup(false);
      setError("");
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.next !== form.confirm) {
      setError("New passwords do not match");
      return;
    }
    setError("");
    change.mutate();
  };

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <SecurityRow
        icon={<Lock />}
        title="Password"
        hint="Change it regularly and never reuse it."
        actions={
          <Button variant="outline" size="control-sm" onClick={() => setOpen(true)}>
            Change password
          </Button>
        }
      />
      <FormDialog
        open={open}
        onOpenChange={close}
        title="Change password"
        description="You stay signed in here. Your other devices are signed out."
        onSubmit={submit}
        submitLabel="Update password"
        isSubmitting={change.isPending}
        size="md"
      >
        <ModalSection title="Password credentials" columns={1}>
          <div className="space-y-2">
            <Label htmlFor="password-current">Current password</Label>
            <Input
              id="password-current"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={form.current}
              onChange={set("current")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password-new">New password</Label>
            <Input
              id="password-new"
              type="password"
              autoComplete="new-password"
              value={form.next}
              onChange={set("next")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password-confirm">Confirm new password</Label>
            <Input
              id="password-confirm"
              type="password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={set("confirm")}
              required
            />
          </div>
          {needsCode && (
            <div className="space-y-2">
              <MfaCodeField
                key={useBackup ? "backup" : "totp"}
                id="password-code"
                kind={useBackup ? "backup" : "totp"}
                label={useBackup ? "Backup code" : "Code from your authenticator app"}
                value={form.code}
                onChange={(code) => setForm((f) => ({ ...f, code }))}
              />
              <button
                type="button"
                className="text-primary hover:text-primary-hover inline-flex min-h-6 items-center text-sm underline-offset-4 hover:underline"
                onClick={() => {
                  setUseBackup((v) => !v);
                  setForm((f) => ({ ...f, code: "" }));
                }}
              >
                {useBackup ? "Use my authenticator app instead" : "Use a backup code instead"}
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </ModalSection>
      </FormDialog>
    </>
  );
};
