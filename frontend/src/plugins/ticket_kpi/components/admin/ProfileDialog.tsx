import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ticketKPIService } from "../../services/ticketKPIService";
import { FieldMappingGrid } from "../FieldMappingGrid";
import { ProfileClientAssignment } from "./ProfileClientAssignment";
import { ProfileAutoDetectSection } from "./ProfileAutoDetectSection";
import { ProfileTransformsSection } from "./ProfileTransformsSection";
import { useProfileDialogState, OUR_FIELDS } from "./useProfileDialogState";
import type { ExportProfile } from "../../types/ticketKPI";

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ExportProfile | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clients: any[] | undefined;
  onSave: (payload: Partial<ExportProfile>) => void;
  isPending: boolean;
}

export const ProfileDialog: React.FC<ProfileDialogProps> = ({
  open,
  onOpenChange,
  profile,
  clients,
  onSave,
  isPending,
}) => {
  const {
    formName,
    setFormName,
    formDesc,
    setFormDesc,
    formActive,
    setFormActive,
    formGlobal,
    setFormGlobal,
    fieldMapping,
    setFieldMapping,
    statusTransforms,
    setStatusTransforms,
    priorityTransforms,
    setPriorityTransforms,
    computeRes,
    setComputeRes,
    computeSla,
    setComputeSla,
    assignedClientIds,
    setAssignedClientIds,
    sampleFile,
    setSampleFile,
    isAutoDetecting,
    setIsAutoDetecting,
    buildPayload,
  } = useProfileDialogState(open, profile);

  const handleAutoDetect = async () => {
    if (!sampleFile) return;
    setIsAutoDetecting(true);
    try {
      const { data } = await ticketKPIService.autoDetect(sampleFile);
      if (data.suggested_mapping && Object.keys(data.suggested_mapping).length > 0) {
        setFieldMapping((prev) => ({ ...prev, ...data.suggested_mapping }));
        toast.success(
          `Auto-detected ${Object.keys(data.suggested_mapping).length} fields from ${data.total_rows} rows`
        );
      } else {
        toast.warning("No fields could be auto-detected from this file");
      }
    } catch {
      toast.error("Auto-detection failed");
    } finally {
      setIsAutoDetecting(false);
    }
  };

  const handleSave = () => {
    onSave(buildPayload());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-border bg-card">
        <DialogHeader>
          <DialogTitle>{profile ? "Edit Profile" : "Create Profile"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. ServiceNow Default"
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              rows={2}
              placeholder="Describe when this profile should be used."
            />
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={formActive} onCheckedChange={setFormActive} />
              <Label>Active</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formGlobal} onCheckedChange={setFormGlobal} />
              <Label>Global</Label>
            </div>
          </div>

          <ProfileClientAssignment
            clients={clients}
            assignedClientIds={assignedClientIds}
            onAssignedClientIdsChange={setAssignedClientIds}
          />

          <ProfileAutoDetectSection
            sampleFile={sampleFile}
            onSampleFileChange={setSampleFile}
            isAutoDetecting={isAutoDetecting}
            onAutoDetect={handleAutoDetect}
          />

          <div className="space-y-2">
            <Label>Field Mapping</Label>
            <p className="text-xs text-muted-foreground">
              Map our fields to the column names in user exports.
            </p>
            <FieldMappingGrid
              fields={OUR_FIELDS}
              mapping={fieldMapping}
              onChange={setFieldMapping}
            />
          </div>

          <ProfileTransformsSection
            title="Status Transforms"
            transforms={statusTransforms}
            onTransformsChange={setStatusTransforms}
          />

          <ProfileTransformsSection
            title="Priority Transforms"
            transforms={priorityTransforms}
            onTransformsChange={setPriorityTransforms}
          />

          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={computeRes} onCheckedChange={setComputeRes} />
              <Label className="text-sm">Compute resolution time</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={computeSla} onCheckedChange={setComputeSla} />
              <Label className="text-sm">Compute SLA</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!formName || isPending}>
            {profile ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
