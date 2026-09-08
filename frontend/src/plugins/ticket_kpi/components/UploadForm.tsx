import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "lucide-react";
import { generateMonthOptions, formatMonthLabel } from "@/lib/monthOptions";

import { FileDropzone } from "./FileDropzone";
import { ProfileSelector } from "./ProfileSelector";
import { ClientSelector } from "./ClientSelector";

// Number of past months to offer in the month dropdown.
const MONTH_OPTION_COUNT = 12;

interface UploadFormProps {
  month: string;
  onMonthChange: (month: string) => void;
  file: File | null;
  onFileAccepted: (file: File) => void;
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
  selectedProfileId: number | null;
  onProfileChange: (profileId: number | null) => void;
  selectedClientIds: number[];
  onClientToggle: (clientId: number, checked: boolean) => void;
  profiles: import("../types/ticketKPI").ExportProfile[] | undefined;
  clients: import("@/types").Client[] | undefined;
  onAnalyze: () => void;
  isAnalyzing: boolean;
}

export const UploadForm: React.FC<UploadFormProps> = ({
  month,
  onMonthChange,
  file,
  onFileAccepted,
  isDragging,
  setIsDragging,
  selectedProfileId,
  onProfileChange,
  selectedClientIds,
  onClientToggle,
  profiles,
  clients,
  onAnalyze,
  isAnalyzing,
}) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-lg">
        <Calendar className="h-5 w-5 text-primary" />
        Select Month & File
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="space-y-2">
        <Label>Month</Label>
        <Select value={month} onValueChange={onMonthChange}>
          <SelectTrigger aria-label="Select month">
            <SelectValue placeholder="Select month">
              {month ? formatMonthLabel(month) : "Select month"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {generateMonthOptions(MONTH_OPTION_COUNT, false, "yyyy-mm").map((m) => (
              <SelectItem key={m} value={m}>
                {formatMonthLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Ticket Export File</Label>
        <FileDropzone
          file={file}
          isDragging={isDragging}
          setIsDragging={setIsDragging}
          onFileAccepted={onFileAccepted}
        />
      </div>

      <ProfileSelector
        selectedProfileId={selectedProfileId}
        onProfileChange={onProfileChange}
        profiles={profiles}
        clients={clients}
      />

      <ClientSelector
        selectedClientIds={selectedClientIds}
        onClientToggle={onClientToggle}
        clients={clients}
      />

      <Button onClick={onAnalyze} disabled={!file || !month || isAnalyzing} className="w-full">
        {isAnalyzing ? "Analyzing..." : "Analyze & Preview"}
      </Button>
    </CardContent>
  </Card>
);
