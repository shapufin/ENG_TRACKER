import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { cleanMfaCode } from "./mfaCode";

interface MfaCodeFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** "totp" takes the 6 digits of an authenticator app; "backup" a 12-character backup code. */
  kind?: "totp" | "backup";
  label?: string;
  error?: string;
  autoFocus?: boolean;
}

export const MfaCodeField = ({
  id,
  value,
  onChange,
  kind = "totp",
  label,
  error,
  autoFocus,
}: MfaCodeFieldProps) => {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label ?? (kind === "totp" ? "6-digit code" : "Backup code")}</Label>
      <Input
        id={id}
        name={id}
        type="text"
        inputMode={kind === "totp" ? "numeric" : "text"}
        autoComplete="one-time-code"
        autoCapitalize={kind === "backup" ? "characters" : "off"}
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={kind === "totp" ? "000000" : "XXXX-XXXX-XXXX"}
        value={value}
        onChange={(e) => onChange(cleanMfaCode(e.target.value, kind))}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "text-center font-mono text-lg tabular-nums",
          kind === "totp" ? "tracking-[0.4em]" : "tracking-[0.15em]"
        )}
        required
      />
      {error && (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
};
