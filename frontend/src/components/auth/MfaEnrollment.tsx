import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { MfaSetupData } from "@/types";
import { MfaCodeField } from "./MfaCodeField";

interface MfaEnrollmentProps {
  setup: MfaSetupData;
  code: string;
  onCodeChange: (code: string) => void;
  error?: string;
  /** Id prefix, so two enrolments never share DOM ids. */
  idPrefix?: string;
}

const secretGroups = (secret: string) => secret.match(/.{1,4}/g) ?? [secret];

/** QR + manual key + code field. Body only: the parent owns the submit button. */
export const MfaEnrollment = ({
  setup,
  code,
  onCodeChange,
  error,
  idPrefix = "mfa",
}: MfaEnrollmentProps) => {
  const [copied, setCopied] = useState(false);

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(setup.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Select the key and copy it by hand.");
    }
  };

  return (
    <div className="space-y-5">
      <section aria-labelledby={`${idPrefix}-step1`} className="space-y-3">
        <h3 id={`${idPrefix}-step1`} className="text-sm font-semibold">
          1. Scan the QR code
        </h3>
        <p className="text-muted-foreground text-sm">
          Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy)
          and add an account by scanning this code.
        </p>
        {/* White tile in both themes: a QR needs dark-on-light contrast to scan. */}
        <div className="flex justify-center">
          <img
            src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qr_svg)}`}
            alt="QR code that adds this account to your authenticator app"
            width={176}
            height={176}
            className="h-44 w-44 rounded-lg border bg-white p-2"
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-muted-foreground text-xs">Cannot scan? Enter this key by hand:</p>
          <div className="flex items-center gap-2">
            <code
              className="bg-muted min-w-0 flex-1 rounded-md px-3 py-2 font-mono text-sm select-all"
              data-testid="mfa-secret"
            >
              {/* Whole groups wrap, never half of one: easier to read off and type by hand. */}
              {secretGroups(setup.secret).map((group, i) => (
                <React.Fragment key={i}>
                  {i > 0 && " "}
                  <span className="inline-block">{group}</span>
                </React.Fragment>
              ))}
            </code>
            <Button
              type="button"
              variant="outline"
              size="control"
              onClick={copyKey}
              aria-label="Copy setup key"
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby={`${idPrefix}-step2`} className="space-y-3">
        <h3 id={`${idPrefix}-step2`} className="text-sm font-semibold">
          2. Enter the code it shows
        </h3>
        <MfaCodeField
          id={`${idPrefix}-enroll-code`}
          value={code}
          onChange={onCodeChange}
          error={error}
          autoFocus
        />
      </section>
    </div>
  );
};
