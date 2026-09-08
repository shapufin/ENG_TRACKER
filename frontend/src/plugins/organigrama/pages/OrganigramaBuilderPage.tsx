/** Admin builder page for custom org charts. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  Folder,
  Loader2,
  Plus,
  Rocket,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { BuilderCanvasInspector } from "../components/BuilderCanvasInspector";
import { PageShell } from "@/components/layout/PageShell";
import { usePermissions } from "@/context/PermissionContext";
import { BuilderNode } from "../components/BuilderNode";
import { builderEdgeTypes } from "../components/BuilderEdge";
import { builderEdgeProps, edgeTypeFromBuilder } from "../components/builderEdgeHelpers";
import { isContainerNode, nodeWidth, nodeHeight, orderNodesParentFirst } from "./groupHelpers";
import {
  useOrganigramaChart,
  useOrganigramaDraft,
  useSaveDraft,
  useValidateDraft,
} from "../hooks/useOrganigramaAdmin";
import { useBuilderSelection } from "../hooks/useBuilderSelection";
import { useBuilderGraphOps, newId } from "../hooks/useBuilderGraphOps";
import type {
  BuilderNodeData,
  EdgeType,
  OrgChartEdge,
  OrgChartNode,
  ShapeType,
  ValidationResult,
} from "../types";

// Curated creation palette (4 core shapes). The full model vocabulary is
// used by BuilderCanvasInspector so any loaded chart shape can be edited.
const SHAPE_TYPES: ShapeType[] = ["person", "department", "position", "label"];

const nodeTypes: NodeTypes = { builderNode: BuilderNode };

const toApiNode = (n: Node): OrgChartNode => {
  const d = n.data as unknown as BuilderNodeData;
  return {
    node_uuid: n.id,
    shape_type: d.shape_type,
    display_name: d.display_name,
    subtitle: d.subtitle ?? "",
    role_title: d.role_title ?? "",
    department_label: d.department_label ?? "",
    description: d.description ?? "",
    status: d.status,
    linked_user_id: d.linked_user_id ?? null,
    sort_order: d.sort_order ?? 0,
    is_searchable: d.is_searchable ?? true,
    is_visible: d.is_visible ?? true,
    style_key: d.style_key ?? "",
    custom_fields: d.custom_fields ?? {},
    position_x: n.position.x,
    position_y: n.position.y,
    // Container nodes use style:{width,height} per React Flow's parent
    // pattern; non-container nodes use top-level width/height. nodeWidth/
    // nodeHeight resolve from either source so saving doesn't lose group
    // dimensions (which would fall back to DEFAULT_WIDTH/HEIGHT otherwise).
    width: nodeWidth(n),
    height: nodeHeight(n),
    group_uuid: n.parentId || null,
  };
};

const toApiEdge = (e: Edge): OrgChartEdge => ({
  edge_uuid: e.id || newId(),
  source_uuid: e.source,
  target_uuid: e.target,
  edge_type:
    (e.data as unknown as { edge_type?: EdgeType } | undefined)?.edge_type ??
    edgeTypeFromBuilder(e.type),
  label: typeof e.label === "string" ? e.label : "",
});

const fromApiNode = (n: OrgChartNode): Node => {
  const data: BuilderNodeData = {
    shape_type: n.shape_type,
    display_name: n.display_name,
    subtitle: n.subtitle,
    role_title: n.role_title,
    department_label: n.department_label,
    description: n.description,
    status: n.status,
    linked_user_id: n.linked_user_id ?? null,
    sort_order: n.sort_order ?? 0,
    is_searchable: n.is_searchable ?? true,
    is_visible: n.is_visible ?? true,
    style_key: n.style_key ?? "",
    custom_fields: n.custom_fields ?? {},
  };
  // Use isContainerNode to detect any container shape (not just "section").
  // Container nodes use style:{width,height} per React Flow's recommended
  // pattern for parent nodes, and zIndex:0 so they render behind their
  // children (which have auto-incrementing zIndex). The previous zIndex:-1
  // could interfere with React Flow's parent-child drag handling.
  const isContainer = isContainerNode({ data } as unknown as Node);
  const width = n.width;
  const height = n.height;
  return {
    id: n.node_uuid,
    type: "builderNode",
    position: { x: n.position_x, y: n.position_y },
    // Container nodes: dimensions go in style (React Flow parent pattern).
    // Non-container nodes: keep top-level width/height for the BuilderNode
    // component which reads them from NodeProps.
    ...(isContainer ? { style: { width, height } } : { width, height }),
    zIndex: isContainer ? 0 : undefined,
    dragHandle: isContainer ? ".builder-group-drag-handle" : undefined,
    parentId: n.group_uuid ?? undefined,
    extent: n.group_uuid ? "parent" : undefined,
    data,
  } as Node;
};

const fromApiEdge = (e: OrgChartEdge): Edge => ({
  id: e.edge_uuid,
  source: e.source_uuid,
  target: e.target_uuid,
  ...builderEdgeProps(e.edge_type),
  label: e.label,
  data: { edge_type: e.edge_type } as Record<string, unknown>,
});

const BuilderCanvas: React.FC = () => {
  const { chartId } = useParams<{ chartId: string }>();
  const id = Number(chartId);
  const navigate = useNavigate();
  const { data: chart } = useOrganigramaChart(id);
  const { data: draft, isLoading, isError } = useOrganigramaDraft(id);
  const { mutate: saveDraft, isPending: saving } = useSaveDraft(id);
  const { mutate: validateDraft } = useValidateDraft(id);
  const reactFlow = useReactFlow();

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Track the last draft revision loaded into local state. After a save,
  // useSaveDraft uses setQueryData to update the draft cache synchronously
  // with the save response — the revision changes, but the nodes/edges are
  // already what the user just saved. Without this guard, the effect would
  // overwrite local state (destroying any post-save edits) and cause a
  // refetch that could trigger a 409 on a rapid second save.
  const lastLoadedRevision = useRef<number | null>(null);

  useEffect(() => {
    if (draft && draft.revision_number !== lastLoadedRevision.current) {
      lastLoadedRevision.current = draft.revision_number;
      setNodes(orderNodesParentFirst(draft.nodes.map(fromApiNode)));
      setEdges(draft.edges.map(fromApiEdge));
    }
  }, [draft]);

  useEffect(() => {
    if (nodes.length > 0) {
      window.setTimeout(() => reactFlow.fitView({ padding: 0.2 }), 0);
    }
  }, [nodes.length, reactFlow]);

  const {
    selectedNode,
    selectedNodeIds,
    selectedEdge,
    setLastSelectedId,
    contextMenu,
    setContextMenu,
    onNodeClick,
    onPaneClick,
    onNodeContextMenu,
    onPaneContextMenu,
  } = useBuilderSelection(nodes, edges, setNodes);

  const {
    onNodesChange,
    onEdgesChange,
    addShape,
    onConnect,
    handleGroup,
    ungroupNode,
    handleUngroup,
    duplicateNodesAndEdges,
    handleDuplicate,
    handleDeleteNode,
    handleDeleteSelected,
    updateSelectedNode,
    updateSelectedEdgeType,
  } = useBuilderGraphOps({
    nodes,
    edges,
    setNodes,
    setEdges,
    selectedNode,
    selectedNodeIds,
    selectedEdge,
    setLastSelectedId,
    setContextMenu,
  });

  const handleSave = useCallback(() => {
    setSaveError(null);
    const payload = {
      revision_number: draft?.revision_number ?? 0,
      nodes: nodes.map(toApiNode),
      edges: edges.map(toApiEdge),
    };
    saveDraft(payload, {
      onSuccess: (data) => {
        // Mark this revision as already loaded so the draft useEffect
        // doesn't overwrite local state when setQueryData fires it.
        // The save response has the same nodes/edges we just saved,
        // so overwriting would only destroy any post-save edits.
        lastLoadedRevision.current = data.revision_number;
        setValidation({ is_valid: true, errors: [] });
      },
      onError: (err: unknown) => {
        const axiosErr = err as {
          response?: { data?: { detail?: string; errors?: { message: string }[] } };
        };
        setSaveError(axiosErr?.response?.data?.detail ?? "Failed to save draft.");
        if (axiosErr?.response?.data) {
          setValidation(axiosErr.response.data as ValidationResult);
        }
      },
    });
  }, [draft, nodes, edges, saveDraft]);

  const handleValidate = useCallback(() => {
    const payload = {
      revision_number: draft?.revision_number ?? 0,
      nodes: nodes.map(toApiNode),
      edges: edges.map(toApiEdge),
    };
    validateDraft(payload, {
      onSuccess: (result) => setValidation(result),
      onError: () =>
        setValidation({ is_valid: false, errors: [{ message: "Validation request failed." }] }),
    });
  }, [draft, nodes, edges, validateDraft]);

  if (isLoading) {
    return (
      <PageShell title="Chart Builder">
        <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  if (isError) {
    return (
      <PageShell title="Chart Builder">
        <div className="flex h-[calc(100vh-8rem)] items-center justify-center gap-2 text-destructive">
          <AlertCircle className="h-6 w-6" />
          <span>Failed to load chart draft.</span>
        </div>
      </PageShell>
    );
  }

  const selectedNodeData = selectedNode?.data as unknown as BuilderNodeData | undefined;
  const selectedEdgeData = selectedEdge?.data as unknown as { edge_type?: EdgeType } | undefined;

  return (
    <PageShell
      title={chart?.name ?? "Chart Builder"}
      subtitle="Define shapes, hierarchy, and relationships. Save as a draft."
      actions={
        <>
          <Button variant="outline" onClick={() => navigate("/admin/organigrama")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          {selectedNodeIds.length > 1 && (
            <Button variant="outline" onClick={handleGroup}>
              <Folder className="mr-2 h-4 w-4" /> Group
            </Button>
          )}
          {selectedNode && isContainerNode(selectedNode) && (
            <Button variant="outline" onClick={handleUngroup}>
              Ungroup
            </Button>
          )}
          {selectedNodeIds.length > 0 && (
            <Button variant="outline" onClick={handleDuplicate}>
              <Copy className="mr-2 h-4 w-4" /> Duplicate
            </Button>
          )}
          {selectedNodeIds.length > 0 && (
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={handleDeleteSelected}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          )}
          <Button variant="outline" onClick={handleValidate} disabled={saving}>
            <Check className="mr-2 h-4 w-4" /> Validate
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" /> {saving ? "Saving..." : "Save Draft"}
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate(`/admin/organigrama/${chartId}/publish`)}
          >
            <Rocket className="mr-2 h-4 w-4" /> Publish
          </Button>
        </>
      }
    >
      <div className="grid h-[calc(100vh-12rem)] grid-cols-1 gap-4 lg:grid-cols-[14rem_1fr_18rem]">
        <GlassCard className="flex flex-col gap-2 overflow-y-auto p-3">
          <h2 className="text-sm font-semibold">Shapes</h2>
          {SHAPE_TYPES.map((shape) => (
            <Button
              key={shape}
              variant="outline"
              className="justify-start text-xs"
              onClick={() => addShape(shape)}
            >
              <Plus className="mr-2 h-3 w-3" /> {shape}
            </Button>
          ))}
        </GlassCard>

        <GlassCard className="relative min-h-0 p-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeContextMenu={onNodeContextMenu}
            onPaneClick={onPaneClick}
            onPaneContextMenu={onPaneContextMenu}
            nodeTypes={nodeTypes}
            edgeTypes={builderEdgeTypes}
            defaultEdgeOptions={builderEdgeProps("reports_to")}
            multiSelectionKeyCode={["Meta", "Control"]}
            deleteKeyCode={["Delete", "Backspace"]}
            fitView
          >
            <Background gap={16} />
            <Controls showInteractive={false} />
          </ReactFlow>
          {contextMenu && (
            <div
              className="fixed z-50 min-w-[10rem] rounded-md border bg-popover p-1 shadow-md"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="ghost"
                className="w-full justify-start text-xs"
                onClick={() => handleDeleteNode(contextMenu.nodeId)}
              >
                Delete
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start text-xs"
                onClick={() => {
                  duplicateNodesAndEdges([contextMenu.nodeId]);
                  setContextMenu(null);
                }}
              >
                Duplicate
              </Button>
              {selectedNodeIds.length > 1 && (
                <Button
                  variant="ghost"
                  className="w-full justify-start text-xs"
                  onClick={handleGroup}
                >
                  Group {selectedNodeIds.length} nodes
                </Button>
              )}
              {nodes.find((n) => n.id === contextMenu.nodeId) &&
                isContainerNode(nodes.find((n) => n.id === contextMenu.nodeId)!) && (
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-xs"
                    onClick={() => ungroupNode(contextMenu.nodeId)}
                  >
                    Ungroup
                  </Button>
                )}
            </div>
          )}
        </GlassCard>

        <GlassCard className="min-h-0 p-0">
          <BuilderCanvasInspector
            selectedNodeData={selectedNodeData}
            selectedEdgeData={selectedEdgeData}
            hasSelectedEdge={Boolean(selectedEdge)}
            updateSelectedNode={updateSelectedNode}
            updateSelectedEdgeType={updateSelectedEdgeType}
            validation={validation}
            saveError={saveError}
          />
        </GlassCard>
      </div>
    </PageShell>
  );
};

export const OrganigramaBuilderPage: React.FC = () => {
  const { isAdmin, isSuperuser } = usePermissions();

  // Staff-only API (IsStaffOrSuperuser) — HR admitted by the admin route
  // guard would only see 403s here.
  if (!isAdmin && !isSuperuser) {
    return <Navigate to="/organigrama" replace />;
  }

  return (
    <ReactFlowProvider>
      <BuilderCanvas />
    </ReactFlowProvider>
  );
};
