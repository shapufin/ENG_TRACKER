import { Download, Copy, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { InfoCallout } from "@/components/ui/InfoCallout";

interface BackupCodesPanelProps {
  codes: string[];
  acknowledged: boolean;
  onAcknowledgedChange: (acknowledged: boolean) => void;
  idPrefix?: string;
}

/**
 * The only time the backup codes are shown. The parent keeps its Continue
 * button disabled until `acknowledged`, so nobody leaves without having had
 * the chance to save them.
 */
export const BackupCodesPanel = ({
  codes,
  acknowledged,
  onAcknowledgedChange,
  idPrefix = "mfa",
}: BackupCodesPanelProps) => {
  const text = codes.join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Backup codes copied");
    } catch {
      toast.error("Could not copy. Select the codes and copy them by hand.");
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([`Backup codes (each works once)\n\n${text}\n`], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "backup-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <InfoCallout
        tone="warning"
        icon={<TriangleAlert className="h-4 w-4" />}
        label="Save these now. They are shown only once, and each one works a single time if you lose your phone."
      />
      <ul
        className="bg-muted grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-lg px-4 py-3 font-mono text-sm sm:grid-cols-2"
        aria-label="Backup codes"
        data-testid="backup-codes"
      >
        {codes.map((code) => (
          <li key={code} className="tabular-nums select-all">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {/* First stop for focus: the step before this unmounted the field that had it. */}
        <Button type="button" variant="outline" size="control" onClick={copy} autoFocus>
          <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
          Copy
        </Button>
        <Button type="button" variant="outline" size="control" onClick={download}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Download
        </Button>
      </div>
      <div className="flex items-start gap-2.5">
        <Checkbox
          id={`${idPrefix}-saved`}
          checked={acknowledged}
          onCheckedChange={(checked) => onAcknowledgedChange(checked === true)}
          className="mt-0.5"
        />
        <Label htmlFor={`${idPrefix}-saved`} className="text-sm leading-snug font-normal">
          I have saved these backup codes somewhere safe
        </Label>
      </div>
    </div>
  );
};
