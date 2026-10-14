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
  selectedEdgeData?: { edge_type?: EdgeType; line_style?: string };
  hasSelectedEdge: boolean;
  updateSelectedNode: <K extends keyof BuilderNodeData>(key: K, value: BuilderNodeData[K]) => void;
  updateSelectedEdgeType: (edgeType: EdgeType) => void;
  updateSelectedEdgeLineStyle?: (lineStyle: string) => void;
  validation: ValidationResult | null;
  saveError: string | null;
}

export const BuilderCanvasInspector: React.FC<BuilderCanvasInspectorProps> = ({
  selectedNodeData,
  selectedEdgeData,
  hasSelectedEdge,
  updateSelectedNode,
  updateSelectedEdgeType,
  updateSelectedEdgeLineStyle,
  validation,
  saveError,
}) => (
  <div className="space-y-4 overflow-y-auto p-3">
    <h2 className="text-sm font-semibold">Inspector</h2>
    {selectedNodeData ? (
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Shape Role</Label>
          <Select
            value={selectedNodeData.shape_type}
            onValueChange={(v: string) => updateSelectedNode("shape_type", v as ShapeType)}
          >
            <SelectTrigger className="text-xs">
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
          <Label className="text-xs">Shape Silhouette</Label>
          <Select
            value={(selectedNodeData.custom_fields?.shape_geometry as string) || "rounded"}
            onValueChange={(v: string) =>
              updateSelectedNode("custom_fields", {
                ...selectedNodeData.custom_fields,
                shape_geometry: v,
              })
            }
          >
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Standard Rounded" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rounded">Standard Rounded Card</SelectItem>
              <SelectItem value="pill">Capsule / Stadium (Pill)</SelectItem>
              <SelectItem value="chamfered">Tech Hexagon (Chamfered)</SelectItem>
              <SelectItem value="sharp">Sharp Rectangle (Square)</SelectItem>
              <SelectItem value="soft">Soft Squircle (Curved)</SelectItem>
              <SelectItem value="leaf">Asymmetric Leaf Badge</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Border Style</Label>
          <Select
            value={(selectedNodeData.custom_fields?.border_style as string) || "solid"}
            onValueChange={(v: string) =>
              updateSelectedNode("custom_fields", {
                ...selectedNodeData.custom_fields,
                border_style: v,
              })
            }
          >
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Solid Border" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="solid">Solid Line</SelectItem>
              <SelectItem value="dashed">Dashed Outline</SelectItem>
              <SelectItem value="dotted">Dotted Outline</SelectItem>
              <SelectItem value="double">Executive Double Border</SelectItem>
              <SelectItem value="glow">Ambient Glow Accent</SelectItem>
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
          <Label className="text-xs">Subtitle</Label>
          <Input
            value={selectedNodeData.subtitle ?? ""}
            placeholder="e.g. Senior / Specialist"
            onChange={(e) => updateSelectedNode("subtitle", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Role / title</Label>
          <Input
            value={selectedNodeData.role_title ?? ""}
            placeholder="e.g. Frontend Architect"
            onChange={(e) => updateSelectedNode("role_title", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Department / group</Label>
          <Input
            value={selectedNodeData.department_label ?? ""}
            placeholder="e.g. Core Platform"
            onChange={(e) => updateSelectedNode("department_label", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Tech Level / Seniority</Label>
          <Input
            value={(selectedNodeData.custom_fields?.tech_level as string) ?? ""}
            placeholder="e.g. L3, L4 Lead, L5"
            onChange={(e) =>
              updateSelectedNode("custom_fields", {
                ...selectedNodeData.custom_fields,
                tech_level: e.target.value,
              })
            }
          />
        </div>
        <div>
          <Label className="text-xs">Color accent</Label>
          <Select
            value={(selectedNodeData.custom_fields?.color_theme as string) || "default"}
            onValueChange={(v: string) =>
              updateSelectedNode("custom_fields", {
                ...selectedNodeData.custom_fields,
                color_theme: v === "default" ? "" : v,
              })
            }
          >
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Default accent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default Shape Color</SelectItem>
              <SelectItem value="blue">Blue (Leadership / Core)</SelectItem>
              <SelectItem value="emerald">Emerald (Operations / Growth)</SelectItem>
              <SelectItem value="purple">Purple (Product / Design)</SelectItem>
              <SelectItem value="amber">Amber (Review / Attention)</SelectItem>
              <SelectItem value="rose">Rose (Critical / Security)</SelectItem>
              <SelectItem value="cyan">Cyan (Infrastructure / Cloud)</SelectItem>
              <SelectItem value="slate">Slate (Neutral / Advisory)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <Select
            value={selectedNodeData.status}
            onValueChange={(v: string) => updateSelectedNode("status", v as NodeStatus)}
          >
            <SelectTrigger className="text-xs">
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
          <Label className="text-xs">Edge relationship</Label>
          <Select
            value={selectedEdgeData?.edge_type ?? "reports_to"}
            onValueChange={(v: string) => updateSelectedEdgeType(v as EdgeType)}
          >
            <SelectTrigger className="text-xs">
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
        <div>
          <Label className="text-xs">Connector Line Style</Label>
          <Select
            value={selectedEdgeData?.line_style || "step"}
            onValueChange={(v: string) => updateSelectedEdgeLineStyle?.(v)}
          >
            <SelectTrigger className="text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="step">Orthogonal Straight (90° Step)</SelectItem>
              <SelectItem value="straight">Direct Straight Line</SelectItem>
              <SelectItem value="bezier">Smooth Curved (Bezier)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    ) : (
      <p className="text-muted-foreground text-sm">Select a node or edge to edit its properties.</p>
    )}

    {validation && (
      <div className="space-y-2">
        <h3 className="text-xs font-semibold">Validation</h3>
        {validation.is_valid ? (
          <p className="text-sm text-green-600">No issues found.</p>
        ) : (
          <ul className="text-destructive max-h-32 overflow-y-auto text-xs">
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
