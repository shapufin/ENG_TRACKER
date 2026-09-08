import { useEffect, useState } from "react";
import type { ExportProfile } from "../../types/ticketKPI";

export const OUR_FIELDS = [
  { key: "ticket_id", label: "Ticket ID", required: true },
  { key: "title", label: "Title", required: true },
  { key: "status", label: "Status", required: true },
  { key: "created_at", label: "Created At", required: true },
  { key: "resolved_at", label: "Resolved At", required: false },
  { key: "assignee", label: "Assignee", required: false },
  { key: "requester", label: "Requester", required: false },
  { key: "priority", label: "Priority", required: false },
  { key: "category", label: "Category", required: false },
];

const DEFAULT_STATUS_TRANSFORMS: Record<string, string> = {
  new: "open",
  "in progress": "open",
  "on hold": "open",
  "awaiting info": "open",
  resolved: "closed",
  closed: "closed",
  "closed complete": "closed",
  cancelled: "cancelled",
  reopened: "open",
};

const DEFAULT_PRIORITY_TRANSFORMS: Record<string, string> = {
  "p1 - critical": "critical",
  p1: "critical",
  critical: "critical",
  "p2 - high": "high",
  p2: "high",
  high: "high",
  "p3 - moderate": "medium",
  p3: "medium",
  moderate: "medium",
  medium: "medium",
  "p4 - low": "low",
  p4: "low",
  low: "low",
  "p5 - planning": "low",
  p5: "low",
};

export const useProfileDialogState = (open: boolean, profile: ExportProfile | null) => {
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formGlobal, setFormGlobal] = useState(false);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [statusTransforms, setStatusTransforms] = useState<Record<string, string>>({
    ...DEFAULT_STATUS_TRANSFORMS,
  });
  const [priorityTransforms, setPriorityTransforms] = useState<Record<string, string>>({
    ...DEFAULT_PRIORITY_TRANSFORMS,
  });
  const [computeRes, setComputeRes] = useState(true);
  const [computeSla, setComputeSla] = useState(false);
  const [assignedClientIds, setAssignedClientIds] = useState<number[]>([]);
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!open) return;
    if (profile) {
      setFormName(profile.name);
      setFormDesc(profile.description);
      setFormActive(profile.is_active);
      setFormGlobal(profile.is_global);
      setFieldMapping(profile.field_mapping || {});
      setStatusTransforms(profile.value_transforms?.status || DEFAULT_STATUS_TRANSFORMS);
      setPriorityTransforms(profile.value_transforms?.priority || DEFAULT_PRIORITY_TRANSFORMS);
      setComputeRes(profile.compute_resolution_time);
      setComputeSla(profile.compute_sla);
      setAssignedClientIds(profile.assigned_client_ids || []);
    } else {
      setFormName("");
      setFormDesc("");
      setFormActive(true);
      setFormGlobal(false);
      setFieldMapping({
        ticket_id: "Number",
        title: "Short description",
        status: "State",
        created_at: "Opened",
        resolved_at: "Resolved",
        assignee: "Assigned to",
        requester: "Caller",
        priority: "Priority",
        category: "Category",
      });
      setStatusTransforms({ ...DEFAULT_STATUS_TRANSFORMS });
      setPriorityTransforms({ ...DEFAULT_PRIORITY_TRANSFORMS });
      setComputeRes(true);
      setComputeSla(false);
      setAssignedClientIds([]);
    }
    setSampleFile(null);
    setIsAutoDetecting(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, profile]);

  const buildPayload = (): Partial<ExportProfile> => ({
    name: formName,
    description: formDesc,
    is_active: formActive,
    is_global: formGlobal,
    field_mapping: fieldMapping,
    value_transforms: { status: statusTransforms, priority: priorityTransforms },
    required_fields: OUR_FIELDS.filter((f) => f.required).map((f) => f.key),
    compute_resolution_time: computeRes,
    compute_sla: computeSla,
    assigned_client_ids: assignedClientIds,
  });

  return {
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
  };
};
