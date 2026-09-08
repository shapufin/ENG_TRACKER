import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EDGE_TYPES, NODE_STATUSES, SHAPE_TYPES } from "../generatedMeta";
import type { BuilderNodeData, EdgeType, NodeStatus, ShapeType, ValidationResult } from "../types";

interface BuilderCanvasInspectorProps {
  selectedNodeData?: BuilderNodeData;
  selectedEdgeData?: { edge_type?: EdgeType };
  hasSelectedEdge: boolean;
  updateSelectedNode: <K extends keyof BuilderNodeData>(key: K, value: BuilderNodeData[K]) => void;
  updateSelectedEdgeType: (edgeType: EdgeType) => void;
  validation: ValidationResult | null;
  saveError: string | null;
}

export const BuilderCanvasInspector: React.FC<BuilderCanvasInspectorProps> = ({
  selectedNodeData,
  selectedEdgeData,
  hasSelectedEdge,
  updateSelectedNode,
  updateSelectedEdgeType,
  validation,
  saveError,
}) => (
  <div className="space-y-4 overflow-y-auto p-3">
    <h2 className="text-sm font-semibold">Inspector</h2>
    {selectedNodeData ? (
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Shape</Label>
          <Select
            value={selectedNodeData.shape_type}
            onValueChange={(v: string) => updateSelectedNode("shape_type", v as ShapeType)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SHAPE_TYPES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Display name</Label>
          <Input
            value={selectedNodeData.display_name}
            onChange={(e) => updateSelectedNode("display_name", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Role / title</Label>
          <Input
            value={selectedNodeData.role_title ?? ""}
            onChange={(e) => updateSelectedNode("role_title", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Department / group</Label>
          <Input
            value={selectedNodeData.department_label ?? ""}
            onChange={(e) => updateSelectedNode("department_label", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <Select
            value={selectedNodeData.status}
            onValueChange={(v: string) => updateSelectedNode("status", v as NodeStatus)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NODE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Description / notes</Label>
          <Textarea
            rows={3}
            value={selectedNodeData.description ?? ""}
            onChange={(e) => updateSelectedNode("description", e.target.value)}
          />
        </div>
      </div>
    ) : hasSelectedEdge ? (
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Edge type</Label>
          <Select
            value={selectedEdgeData?.edge_type ?? "reports_to"}
            onValueChange={(v: string) => updateSelectedEdgeType(v as EdgeType)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EDGE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">Select a node or edge to edit its properties.</p>
    )}

    {validation && (
      <div className="space-y-2">
        <h3 className="text-xs font-semibold">Validation</h3>
        {validation.is_valid ? (
          <p className="text-sm text-green-600">No issues found.</p>
        ) : (
          <ul className="max-h-32 overflow-y-auto text-xs text-destructive">
            {validation.errors?.map((err, i) => (
              <li key={i}>{err.message}</li>
            ))}
            {!validation.errors?.length && saveError && <li>{saveError}</li>}
          </ul>
        )}
      </div>
    )}
  </div>
);
