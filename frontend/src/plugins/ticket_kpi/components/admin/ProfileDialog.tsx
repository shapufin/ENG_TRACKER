import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden border-border">
        <DialogHeader className="shrink-0">
          <DialogTitle>{profile ? "Edit Profile" : "Create Profile"}</DialogTitle>
          <DialogDescription>
            Configure the export profile: fields, client scope, and value transforms.
          </DialogDescription>
        </DialogHeader>
        <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. ServiceNow Default"
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-description">Description</Label>
            <Textarea
              id="profile-description"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              rows={2}
              placeholder="Describe when this profile should be used."
            />
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <Switch id="profile-active" checked={formActive} onCheckedChange={setFormActive} />
              <Label htmlFor="profile-active">Active</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="profile-global" checked={formGlobal} onCheckedChange={setFormGlobal} />
              <Label htmlFor="profile-global">Global</Label>
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

          <div className="space-y-2" role="group" aria-labelledby="profile-mapping-label">
            <Label id="profile-mapping-label">Field Mapping</Label>
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
              <Switch
                id="profile-compute-res"
                checked={computeRes}
                onCheckedChange={setComputeRes}
              />
              <Label htmlFor="profile-compute-res" className="text-sm">
                Compute resolution time
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="profile-compute-sla"
                checked={computeSla}
                onCheckedChange={setComputeSla}
              />
              <Label htmlFor="profile-compute-sla" className="text-sm">
                Compute SLA
              </Label>
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t pt-4">
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
