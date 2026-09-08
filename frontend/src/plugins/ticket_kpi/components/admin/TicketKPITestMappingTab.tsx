import React, { useState } from "react";
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
import { Eye, TestTube } from "lucide-react";
import { FileDropzone } from "../FileDropzone";
import { TestMappingResult } from "../../components/TestMappingResult";
import type { ExportProfile, UploadPreview } from "../../types/ticketKPI";

interface TicketKPITestMappingTabProps {
  profiles: ExportProfile[] | undefined;
  testProfileId: number | null;
  onProfileChange: (id: number | null) => void;
  testFile: File | null;
  onFileChange: (file: File | null) => void;
  onTest: () => void;
  testResult: UploadPreview | null;
}

export const TicketKPITestMappingTab: React.FC<TicketKPITestMappingTabProps> = ({
  profiles,
  testProfileId,
  onProfileChange,
  testFile,
  onFileChange,
  onTest,
  testResult,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <TestTube className="h-5 w-5 text-primary" /> Test Mapping
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Profile</Label>
          <Select
            value={testProfileId ? String(testProfileId) : ""}
            onValueChange={(v) => onProfileChange(v ? Number(v) : null)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select profile..." />
            </SelectTrigger>
            <SelectContent>
              {profiles?.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>File (CSV / XLSX / XLS)</Label>
          <FileDropzone
            file={testFile}
            isDragging={isDragging}
            setIsDragging={setIsDragging}
            onFileAccepted={onFileChange}
          />
        </div>
        <Button onClick={onTest} disabled={!testFile || !testProfileId}>
          <Eye className="mr-2 h-4 w-4" /> Test Mapping
        </Button>

        {testResult && <TestMappingResult result={testResult} />}
      </CardContent>
    </Card>
  );
};
