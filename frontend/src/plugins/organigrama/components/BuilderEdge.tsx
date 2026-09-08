/** Custom React Flow edge components for the organigrama builder.
 *
 * Each edge type has a distinct visual style (color, dash pattern, arrowhead)
 * applied via inline styles on the SVG path. This is necessary because
 * React Flow's `.react-flow__edge-path` CSS sets its own `stroke` which
 * overrides inherited styles from a parent `<g>` className — only inline
 * styles on the path element win.
 *
 * Style configs and pure helpers live in builderEdgeHelpers.ts so this file
 * only exports React components (react-refresh compliance).
 */
import React, { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { EdgeType } from "../types";
import { EDGE_STYLE_CONFIGS, edgePathStyle } from "./builderEdgeHelpers";

interface BuilderEdgeComponentProps extends EdgeProps {
  edgeType: EdgeType;
}

const BuilderEdgeBase: React.FC<BuilderEdgeComponentProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  selected,
  markerEnd,
  edgeType,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const config = EDGE_STYLE_CONFIGS[edgeType];
  const style = edgePathStyle(edgeType);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          ...(selected ? { strokeWidth: config.strokeWidth + 1 } : {}),
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
              fontSize: 10,
              fontWeight: 500,
              color: config.labelColor ?? config.stroke,
              background: "var(--background, #fff)",
              padding: "1px 4px",
              borderRadius: 3,
              border: "1px solid currentColor",
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export const ReportsToEdge: React.FC<EdgeProps> = (props) => (
  <BuilderEdgeBase {...props} edgeType="reports_to" />
);
export const ContainsEdge: React.FC<EdgeProps> = (props) => (
  <BuilderEdgeBase {...props} edgeType="contains" />
);
export const DottedLineEdge: React.FC<EdgeProps> = (props) => (
  <BuilderEdgeBase {...props} edgeType="dotted_line" />
);
export const AssistantEdge: React.FC<EdgeProps> = (props) => (
  <BuilderEdgeBase {...props} edgeType="assistant" />
);
export const AssociationEdge: React.FC<EdgeProps> = (props) => (
  <BuilderEdgeBase {...props} edgeType="association" />
);

// eslint-disable-next-line react-refresh/only-export-components -- edge type map is a constant referencing components, not itself a component
export const builderEdgeTypes = {
  "builder-reports_to": memo(ReportsToEdge),
  "builder-contains": memo(ContainsEdge),
  "builder-dotted_line": memo(DottedLineEdge),
  "builder-assistant": memo(AssistantEdge),
  "builder-association": memo(AssociationEdge),
} as const;
