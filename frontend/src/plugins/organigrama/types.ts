/** Types for the Organigrama plugin. */

// Controlled vocabulary types (ShapeType, EdgeType, NodeStatus) are
// generated from the backend canonical constants by
// scripts/generate_organigrama_meta.py. Import the types here for use in
// this module's interfaces. Value arrays/sets are imported directly from
// generatedMeta at call sites — not re-exported here to avoid a stale
// duplicate export surface.
import type {
  ShapeType as _ShapeType,
  EdgeType as _EdgeType,
  NodeStatus as _NodeStatus,
} from "./generatedMeta";

export type ShapeType = _ShapeType;
export type EdgeType = _EdgeType;
export type NodeStatus = _NodeStatus;

export type NodeType = "person" | "tech";

export type RoleBadge = "italian_tl" | "albanian_tl" | "hr" | "admin" | "employee";

export interface TreeNode {
  type: NodeType;
  id: number;
  username?: string;
  full_name?: string;
  role_badge?: RoleBadge;
  name?: string;
  code?: string;
  children: TreeNode[];
}

export interface OrgTreeResponse {
  roots: TreeNode[];
  scope: "full" | "subtree" | "chain";
  total_nodes: number;
}

export type ChartStatus = "draft" | "published" | "archived";

export type AudienceMode = "all_authenticated" | "selected" | "private_admin";

export interface OrgChart {
  id: number;
  name: string;
  slug: string;
  description: string;
  source_mode: "live" | "custom";
  status: ChartStatus;
  audience_mode: AudienceMode;
  is_featured: boolean;
  revision_number: number;
  node_count: number;
  created_by: number | null;
  created_by_name?: string;
  updated_by: number | null;
  updated_by_name?: string;
  published_revision: number | null;
  published_at: string | null;
  published_by_name: string | null;
  audience_role_codes: string[];
  audience_group_ids: number[];
  created_at: string;
  updated_at: string;
}

export interface UpdateChartPayload {
  name?: string;
  description?: string;
  source_mode?: "live" | "custom";
  is_featured?: boolean;
  audience_mode?: AudienceMode;
  audience_role_codes?: string[];
  audience_group_ids?: number[];
}

export interface OrgChartNode {
  node_uuid: string;
  shape_type: ShapeType;
  display_name: string;
  subtitle?: string;
  role_title?: string;
  department_label?: string;
  description?: string;
  status: NodeStatus;
  linked_user_id?: number | null;
  group_uuid?: string | null;
  sort_order?: number;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  style_key?: string;
  custom_fields?: Record<string, unknown>;
  is_searchable?: boolean;
  is_visible?: boolean;
}

export interface OrgChartEdge {
  edge_uuid: string;
  source_uuid: string;
  target_uuid: string;
  edge_type: EdgeType;
  label?: string;
  sort_order?: number;
  style_key?: string;
}

export interface DraftPayload {
  revision_number: number;
  nodes: OrgChartNode[];
  edges: OrgChartEdge[];
}

export interface ValidationErrorItem {
  node_uuid?: string | null;
  edge_uuid?: string | null;
  field?: string | null;
  message: string;
  type?: string | null;
}

export interface ValidationResult {
  is_valid: boolean;
  errors: ValidationErrorItem[];
}

export interface OrgChartRevision {
  id: number;
  version: number;
  checksum: string;
  change_summary: string;
  schema_version: number;
  published_by: number | null;
  published_by_name: string | null;
  published_at: string;
}

export interface RoleMini {
  id: number;
  name: string;
  code: string;
}

export interface GroupMini {
  id: number;
  name: string;
  code: string;
}

export interface BuilderNodeData extends Record<string, unknown> {
  shape_type: ShapeType;
  display_name: string;
  subtitle?: string;
  role_title?: string;
  department_label?: string;
  description?: string;
  status: NodeStatus;
  linked_user_id?: number | null;
  sort_order?: number;
  is_searchable?: boolean;
  is_visible?: boolean;
  style_key?: string;
  custom_fields?: Record<string, unknown>;
}
