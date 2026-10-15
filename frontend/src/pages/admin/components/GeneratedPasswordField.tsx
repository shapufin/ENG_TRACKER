import React from "react";
import { Copy, Eye, EyeOff, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generatePassword } from "@/lib/generatePassword";

interface GeneratedPasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

/** Password input with show/hide, one-click generate and copy, so an admin can
 * hand over a strong first password without inventing one. */
export const GeneratedPasswordField: React.FC<GeneratedPasswordFieldProps> = ({
  value,
  onChange,
  error,
}) => {
  const id = React.useId();
  const [revealed, setRevealed] = React.useState(false);

  const handleGenerate = () => {
    onChange(generatePassword());
    setRevealed(true);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Password copied");
    } catch {
      toast.error("Could not copy the password");
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Password</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="new-password"
          className={error ? "border-destructive" : ""}
        />
        <Button
          type="button"
          variant="outline"
          size="control-icon-sm"
          aria-label={revealed ? "Hide password" : "Show password"}
          onClick={() => setRevealed((r) => !r)}
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="control-icon-sm"
          aria-label="Generate password"
          onClick={handleGenerate}
        >
          <Wand2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="control-icon-sm"
          aria-label="Copy password"
          disabled={!value}
          onClick={handleCopy}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
};
