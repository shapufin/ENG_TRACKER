/** Pure helpers and style configs for builder edge components.
 *
 * Extracted from BuilderEdge.tsx so that file only exports React components
 * (react-refresh/only-export-components rule). These helpers are testable
 * without rendering React components.
 */
import { MarkerType } from "@xyflow/react";
import type React from "react";
import type { EdgeType } from "../types";

interface EdgeStyleConfig {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  /** React Flow markerEnd object — React Flow creates the SVG marker automatically. */
  markerEnd?: { type: MarkerType; color: string };
  labelColor?: string;
}

export const EDGE_STYLE_CONFIGS: Record<EdgeType, EdgeStyleConfig> = {
  reports_to: {
    stroke: "#1e293b", // slate-800
    strokeWidth: 2,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#1e293b" },
    labelColor: "#1e293b",
  },
  contains: {
    stroke: "#2563eb", // blue-600
    strokeWidth: 2,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#2563eb" },
    labelColor: "#2563eb",
  },
  dotted_line: {
    stroke: "#f59e0b", // amber-500
    strokeWidth: 1.5,
    strokeDasharray: "6 4",
    labelColor: "#b45309", // amber-700
  },
  assistant: {
    stroke: "#a855f7", // purple-500
    strokeWidth: 1.5,
    strokeDasharray: "4 4",
    labelColor: "#7e22ce", // purple-700
  },
  association: {
    stroke: "#64748b", // slate-500
    strokeWidth: 1.5,
    strokeDasharray: "2 4",
    labelColor: "#475569", // slate-600
  },
};

/** Return the React Flow markerEnd object for an edge type, or undefined.
 *
 * This must be set on the edge object's `markerEnd` property (NOT computed
 * in the edge component). React Flow reads the object, creates a `<marker>`
 * element in the SVG `<defs>`, and passes the resolved URL string to the
 * custom edge component via `props.markerEnd`.
 */
export function markerEndFor(edgeType: EdgeType): { type: MarkerType; color: string } | undefined {
  return EDGE_STYLE_CONFIGS[edgeType].markerEnd;
}

/** The inline style object applied to the edge path. */
export function edgePathStyle(edgeType: EdgeType): React.CSSProperties {
  const config = EDGE_STYLE_CONFIGS[edgeType];
  const style: React.CSSProperties = {
    stroke: config.stroke,
    strokeWidth: config.strokeWidth,
  };
  if (config.strokeDasharray) {
    style.strokeDasharray = config.strokeDasharray;
  }
  return style;
}

/** The edge type name used in the React Flow `edgeTypes` map. */
const BUILDER_EDGE_TYPE_PREFIX = "builder-";

export function builderEdgeType(edgeType: EdgeType): string {
  return `${BUILDER_EDGE_TYPE_PREFIX}${edgeType}`;
}

/** Reverse: extract the EdgeType from a builder edge type name. */
export function edgeTypeFromBuilder(type: string | undefined): EdgeType {
  if (!type || !type.startsWith(BUILDER_EDGE_TYPE_PREFIX)) return "reports_to";
  return type.slice(BUILDER_EDGE_TYPE_PREFIX.length) as EdgeType;
}

/** Build the React Flow edge properties for a semantic edge type.
 *
 * Returns `{ type, markerEnd }` — the `type` selects the custom edge
 * component from `builderEdgeTypes`, and `markerEnd` is the object that
 * React Flow reads to create an SVG `<marker>` element in `<defs>`. The
 * custom edge component receives the resolved marker URL via
 * `props.markerEnd`.
 *
 * Use this when creating or updating edges so arrowheads appear
 * automatically for hierarchy edges (reports_to, contains).
 */
export function builderEdgeProps(edgeType: EdgeType): {
  type: string;
  markerEnd?: { type: MarkerType; color: string };
} {
  return {
    type: builderEdgeType(edgeType),
    markerEnd: markerEndFor(edgeType),
  };
}
