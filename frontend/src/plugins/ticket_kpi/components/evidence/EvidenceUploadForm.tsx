import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EvidenceFileInput } from "./EvidenceFileInput";
import { ClientSelector } from "../ClientSelector";
import { formatMonthLabel } from "@/lib/monthOptions";
import type { EvidenceType } from "../../types/ticketKPI";
import type { Client } from "@/types";

const EVIDENCE_TYPE_OPTIONS: { value: EvidenceType; label: string }[] = [
  { value: "document", label: "Document" },
  { value: "certificate", label: "Certificate" },
  { value: "email_thread", label: "Email Thread" },
  { value: "screenshot", label: "Screenshot" },
  { value: "other", label: "Other" },
];

interface EvidenceUploadFormProps {
  month: string;
  availableClients: Client[];
  selectedType: EvidenceType;
  onTypeChange: (type: EvidenceType) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  file: File | null;
  onFileAccepted: (file: File) => void;
  selectedClientIds: number[];
  onClientToggle: (clientId: number, checked: boolean) => void;
  onSubmit: () => void;
  isPending: boolean;
}

export const EvidenceUploadForm: React.FC<EvidenceUploadFormProps> = ({
  month,
  availableClients,
  selectedType,
  onTypeChange,
  description,
  onDescriptionChange,
  file,
  onFileAccepted,
  selectedClientIds,
  onClientToggle,
  onSubmit,
  isPending,
}) => (
  <div className="space-y-4">
    <div className="space-y-1">
      <Label>Month</Label>
      <p className="text-sm text-foreground">{formatMonthLabel(month)}</p>
    </div>

    <div className="space-y-2">
      <Label>Evidence Type</Label>
      <Select value={selectedType} onValueChange={(v) => onTypeChange(v as EvidenceType)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EVIDENCE_TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    <div className="space-y-2">
      <Label>File</Label>
      <EvidenceFileInput file={file} onFileAccepted={onFileAccepted} />
    </div>

    <div className="space-y-2">
      <Label>Description</Label>
      <Textarea
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder="Add context for this evidence"
        rows={3}
      />
    </div>

    <ClientSelector
      clients={availableClients}
      selectedClientIds={selectedClientIds}
      onClientToggle={onClientToggle}
    />

    <Button
      onClick={onSubmit}
      disabled={
        !file ||
        isPending ||
        !description.trim() ||
        (availableClients.length > 0 && selectedClientIds.length === 0)
      }
      className="w-full"
    >
      {isPending ? "Uploading..." : "Upload Evidence"}
    </Button>
    {!description.trim() && file && (
      <p className="text-xs text-muted-foreground">A description is required.</p>
    )}
    {availableClients.length > 0 && selectedClientIds.length === 0 && file && (
      <p className="text-xs text-muted-foreground">Select at least one client.</p>
    )}
  </div>
);
