import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";

interface ProfileAutoDetectSectionProps {
  sampleFile: File | null;
  onSampleFileChange: (file: File | null) => void;
  isAutoDetecting: boolean;
  onAutoDetect: () => void;
}

export const ProfileAutoDetectSection: React.FC<ProfileAutoDetectSectionProps> = ({
  sampleFile,
  onSampleFileChange,
  isAutoDetecting,
  onAutoDetect,
}) => (
  <div className="border-border space-y-3 rounded-md border border-dashed p-4">
    <div className="flex items-center justify-between">
      <Label className="text-sm font-medium">Auto-detect from sample file</Label>
      <Sparkles className="text-muted-foreground h-4 w-4" />
    </div>
    <p className="text-muted-foreground text-xs">
      Upload a sample export file and we will suggest column mappings automatically.
    </p>
    <div className="flex items-center gap-3">
      <Input
        type="file"
        accept=".csv,.xlsx,.xls"
        className="text-sm"
        onChange={(e) => onSampleFileChange(e.target.files?.[0] || null)}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={onAutoDetect}
        disabled={!sampleFile || isAutoDetecting}
      >
        {isAutoDetecting ? "Detecting..." : "Auto-detect"}
      </Button>
    </div>
  </div>
);
