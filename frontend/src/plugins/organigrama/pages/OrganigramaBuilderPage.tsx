/** Admin builder page for custom org charts with auto-layout, live import, undo/redo, and rich cards. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Building,
  Building2,
  Check,
  Circle,
  Copy,
  Download,
  FileDown,
  Folder,
  Globe,
  HelpCircle,
  Hexagon,
  Loader2,
  MapPin,
  Plus,
  Redo2,
  Rocket,
  Save,
  Sparkles,
  Square,
  Tag,
  Trash2,
  Undo2,
  User,
  UserX,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/SearchField";
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
import { calculateHierarchyLayout } from "../hooks/useBuilderAutoLayout";
import { useBuilderHistory } from "../hooks/useBuilderHistory";
import { convertLiveTreeToGraph } from "../services/liveTreeConverter";
import { organigramaService } from "../services/organigramaService";
import { BuilderActionsContext } from "../components/BuilderActionsContext";
import { exportCanvasToPng } from "../components/viewerHelpers";
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import type {
  BuilderNodeData,
  EdgeType,
  OrgChartEdge,
  OrgChartNode,
  ShapeType,
  ValidationResult,
} from "../types";

const nodeTypes: NodeTypes = { builderNode: BuilderNode };

interface ShapePaletteItem {
  shape: ShapeType;
  label: string;
  icon: React.ReactNode;
  initialCustomFields?: Record<string, unknown>;
}

const SHAPE_CATEGORIES: { category: string; items: ShapePaletteItem[] }[] = [
  {
    category: "Shape Silhouettes",
    items: [
      {
        shape: "person",
        label: "Pill Capsule",
        icon: <Circle className="h-3.5 w-3.5 text-blue-500" />,
        initialCustomFields: { shape_geometry: "pill" },
      },
      {
        shape: "department",
        label: "Tech Hexagon",
        icon: <Hexagon className="h-3.5 w-3.5 text-purple-500" />,
        initialCustomFields: { shape_geometry: "chamfered" },
      },
      {
        shape: "position",
        label: "Sharp Rectangle",
        icon: <Square className="h-3.5 w-3.5 text-emerald-500" />,
        initialCustomFields: { shape_geometry: "sharp" },
      },
      {
        shape: "team",
        label: "Soft Squircle",
        icon: <Sparkles className="h-3.5 w-3.5 text-sky-500" />,
        initialCustomFields: { shape_geometry: "soft" },
      },
      {
        shape: "person",
        label: "Executive Double",
        icon: <User className="h-3.5 w-3.5 text-amber-500" />,
        initialCustomFields: { border_style: "double", color_theme: "amber" },
      },
    ],
  },
  {
    category: "People & Roles",
    items: [
      { shape: "person", label: "Person", icon: <User className="h-3.5 w-3.5 text-blue-500" /> },
      {
        shape: "position",
        label: "Position",
        icon: <Briefcase className="h-3.5 w-3.5 text-emerald-500" />,
      },
      {
        shape: "vacant",
        label: "Vacant / Hiring",
        icon: <UserX className="h-3.5 w-3.5 text-amber-500" />,
      },
      {
        shape: "external",
        label: "External / Contractor",
        icon: <Globe className="h-3.5 w-3.5 text-purple-500" />,
      },
    ],
  },
  {
    category: "Units & Teams",
    items: [
      {
        shape: "department",
        label: "Department",
        icon: <Building className="h-3.5 w-3.5 text-indigo-500" />,
      },
      {
        shape: "division",
        label: "Division",
        icon: <Building2 className="h-3.5 w-3.5 text-indigo-600" />,
      },
      { shape: "team", label: "Team", icon: <Users className="h-3.5 w-3.5 text-sky-500" /> },
      {
        shape: "location",
        label: "Location / Office",
        icon: <MapPin className="h-3.5 w-3.5 text-cyan-500" />,
      },
    ],
  },
  {
    category: "Grouping & Notes",
    items: [
      {
        shape: "section",
        label: "Group Section",
        icon: <Folder className="h-3.5 w-3.5 text-slate-500" />,
      },
      {
        shape: "label",
        label: "Annotation Label",
        icon: <Tag className="text-muted-foreground h-3.5 w-3.5" />,
      },
      {
        shape: "placeholder",
        label: "Placeholder",
        icon: <HelpCircle className="text-muted-foreground h-3.5 w-3.5" />,
      },
    ],
  },
];

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
    width: nodeWidth(n),
    height: nodeHeight(n),
    group_uuid: n.parentId || null,
  };
};

const toApiEdge = (e: Edge): OrgChartEdge => {
  const edgeData = e.data as Record<string, unknown> | undefined;
  return {
    edge_uuid: e.id || newId(),
    source_uuid: e.source,
    target_uuid: e.target,
    edge_type: (edgeData?.edge_type as EdgeType) ?? edgeTypeFromBuilder(e.type),
    label: typeof e.label === "string" ? e.label : "",
    custom_fields: {
      ...((edgeData?.custom_fields as Record<string, unknown>) ?? {}),
      ...(edgeData?.line_style ? { line_style: edgeData.line_style } : {}),
    },
  };
};

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
  const isContainer = isContainerNode({ data } as unknown as Node);
  const width = n.width;
  const height = n.height;
  return {
    id: n.node_uuid,
    type: "builderNode",
    position: { x: n.position_x, y: n.position_y },
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
  data: {
    edge_type: e.edge_type,
    line_style: (e.custom_fields?.line_style as string) || "step",
    custom_fields: e.custom_fields ?? {},
  } as Record<string, unknown>,
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
  const [searchQuery, setSearchQuery] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const lastLoadedRevision = useRef<number | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

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
    addChildNode,
    addPeerNode,
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
    updateSelectedEdgeLineStyle,
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

  const { canUndo, canRedo, undo, redo, recordSnapshot } = useBuilderHistory(
    nodes,
    edges,
    setNodes,
    setEdges
  );

  const handleAutoLayout = useCallback(() => {
    recordSnapshot(nodes, edges);
    const layouted = calculateHierarchyLayout(nodes, edges, {
      direction: "TB",
      nodeSep: 50,
      rankSep: 90,
    });
    setNodes(layouted);
    window.setTimeout(() => reactFlow.fitView({ padding: 0.2, duration: 600 }), 50);
  }, [nodes, edges, recordSnapshot, reactFlow]);

  const handleImportLiveOrg = useCallback(async () => {
    if (
      nodes.length > 0 &&
      !window.confirm(
        "Importing the company hierarchy will replace existing canvas nodes. Continue?"
      )
    ) {
      return;
    }
    setIsImporting(true);
    try {
      const tree = await organigramaService.getTree();
      if (tree && tree.roots) {
        recordSnapshot(nodes, edges);
        const { nodes: importedNodes, edges: importedEdges } = convertLiveTreeToGraph(tree.roots);
        setNodes(importedNodes);
        setEdges(importedEdges);
        window.setTimeout(() => reactFlow.fitView({ padding: 0.2, duration: 600 }), 100);
      }
    } catch {
      alert("Failed to fetch live company hierarchy.");
    } finally {
      setIsImporting(false);
    }
  }, [nodes, edges, recordSnapshot, reactFlow]);

  const handleSearchNode = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (!query.trim()) return;
      const q = query.toLowerCase().trim();
      const match = nodes.find((n) => {
        const d = n.data as unknown as BuilderNodeData;
        return (
          d.display_name.toLowerCase().includes(q) ||
          (d.role_title && d.role_title.toLowerCase().includes(q))
        );
      });
      if (match) {
        reactFlow.fitView({ nodes: [match], duration: 600, padding: 0.8 });
        setNodes((prev) =>
          prev.map((n) => ({
            ...n,
            selected: n.id === match.id,
          }))
        );
        setLastSelectedId(match.id);
      }
    },
    [nodes, reactFlow, setLastSelectedId]
  );

  const handleExportPng = useCallback(async () => {
    const filename = `${chart?.name || "org-chart"}-export.png`;
    const success = await exportCanvasToPng(canvasRef.current, filename);
    if (!success) {
      alert("Failed to export chart image.");
    }
  }, [chart]);

  const handleExportPdf = useCallback(async () => {
    if (!canvasRef.current) return;
    const viewport = canvasRef.current.querySelector(".react-flow__viewport") as HTMLElement | null;
    if (!viewport) return;
    try {
      const canvas = await html2canvas(viewport, {
        backgroundColor: "#ffffff",
        scale: 2,
        logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      pdf.setFontSize(16);
      pdf.text(chart?.name || "Organizational Chart", 40, 40);
      pdf.addImage(imgData, "PNG", 40, 60, pageWidth - 80, pageHeight - 100);
      pdf.save(`${chart?.name || "org-chart"}.pdf`);
    } catch {
      alert("Failed to export PDF.");
    }
  }, [chart]);

  const handleSave = useCallback(() => {
    setSaveError(null);
    const payload = {
      revision_number: draft?.revision_number ?? 0,
      nodes: nodes.map(toApiNode),
      edges: edges.map(toApiEdge),
    };
    saveDraft(payload, {
      onSuccess: (data) => {
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
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      </PageShell>
    );
  }

  if (isError) {
    return (
      <PageShell title="Chart Builder">
        <div className="text-destructive flex h-[calc(100vh-8rem)] items-center justify-center gap-2">
          <AlertCircle className="h-6 w-6" />
          <span>Failed to load chart draft.</span>
        </div>
      </PageShell>
    );
  }

  const selectedNodeData = selectedNode?.data as unknown as BuilderNodeData | undefined;
  const selectedEdgeData = selectedEdge?.data as unknown as
    | { edge_type?: EdgeType; line_style?: string }
    | undefined;

  return (
    <PageShell
      title={chart?.name ?? "Chart Builder"}
      subtitle="Define shapes, hierarchy, and relationships. Save as a draft."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/organigrama")}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
          </Button>

          {/* Undo / Redo */}
          <div className="dark:border-border flex items-center gap-1 border-r pr-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Auto-Arrange */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoLayout}
            title="Auto-arrange tree hierarchy"
          >
            <Sparkles className="text-primary mr-1.5 h-3.5 w-3.5" /> Auto-Arrange
          </Button>

          {/* Live Org Import */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportLiveOrg}
            disabled={isImporting}
            title="Clone live company hierarchy into draft"
          >
            {isImporting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" />
            )}
            Import Live Org
          </Button>

          {/* Selection Actions */}
          {selectedNodeIds.length > 1 && (
            <Button variant="outline" size="sm" onClick={handleGroup}>
              <Folder className="mr-1.5 h-3.5 w-3.5" /> Group
            </Button>
          )}
          {selectedNode && isContainerNode(selectedNode) && (
            <Button variant="outline" size="sm" onClick={handleUngroup}>
              Ungroup
            </Button>
          )}
          {selectedNodeIds.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleDuplicate}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicate
            </Button>
          )}
          {selectedNodeIds.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={handleDeleteSelected}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
          )}

          {/* Export Dropdown / Buttons */}
          <div className="dark:border-border flex items-center gap-1 border-l pl-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportPng}
              title="Export as PNG image"
              aria-label="Export PNG"
            >
              <Download className="h-3.5 w-3.5" /> PNG
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportPdf}
              title="Export as PDF document"
              aria-label="Export PDF"
            >
              <FileDown className="h-3.5 w-3.5" /> PDF
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={handleValidate} disabled={saving}>
            <Check className="mr-1.5 h-3.5 w-3.5" /> Validate
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="mr-1.5 h-3.5 w-3.5" /> {saving ? "Saving..." : "Save Draft"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/admin/organigrama/${chartId}/publish`)}
          >
            <Rocket className="mr-1.5 h-3.5 w-3.5" /> Publish
          </Button>
        </>
      }
    >
      <div className="grid h-[calc(100vh-12rem)] grid-cols-1 gap-4 lg:grid-cols-[15rem_1fr_18rem]">
        {/* Left categorized shape palette */}
        <GlassCard className="flex flex-col gap-3 overflow-y-auto p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Palette
            </h2>
            <span className="text-muted-foreground text-[10px]">{nodes.length} nodes</span>
          </div>

          {SHAPE_CATEGORIES.map((category) => (
            <div key={category.category} className="space-y-1">
              <span className="text-muted-foreground text-[11px] font-medium">
                {category.category}
              </span>
              <div className="grid grid-cols-1 gap-1">
                {category.items.map((item) => (
                  <Button
                    key={item.label}
                    variant="outline"
                    size="sm"
                    className="justify-start px-2 text-xs"
                    onClick={() => addShape(item.shape, item.initialCustomFields)}
                  >
                    <span className="mr-2">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </GlassCard>

        {/* Center Canvas */}
        <GlassCard className="relative flex min-h-0 flex-col overflow-hidden p-0" ref={canvasRef}>
          {/* Quick Search Header Bar inside canvas */}
          <div className="absolute top-2 left-2 z-10 w-48">
            <SearchField
              value={searchQuery}
              onChange={handleSearchNode}
              placeholder="Find node in canvas..."
              aria-label="Find node in canvas"
              controlSize="sm"
            />
          </div>

          <BuilderActionsContext.Provider
            value={{
              onAddChild: (parentId) => addChildNode(parentId),
              onAddPeer: (nodeId) => addPeerNode(nodeId),
              onDeleteNode: (nodeId) => handleDeleteNode(nodeId),
            }}
          >
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
              <MiniMap
                zoomable
                pannable
                className="!bg-background/80 !border-border !rounded-lg !border !shadow-sm"
                nodeColor={(n) => {
                  const d = n.data as unknown as BuilderNodeData;
                  if (d?.shape_type === "person") return "#3b82f6";
                  if (d?.shape_type === "department" || d?.shape_type === "division")
                    return "#6366f1";
                  if (d?.shape_type === "team") return "#0284c7";
                  if (d?.shape_type === "vacant" || d?.status === "vacant") return "#f59e0b";
                  return "#94a3b8";
                }}
              />
            </ReactFlow>
          </BuilderActionsContext.Provider>

          {contextMenu && (
            <div
              className="bg-popover fixed z-50 min-w-[10rem] rounded-md border p-1 shadow-md"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="ghost"
                className="w-full justify-start text-xs"
                onClick={() => addChildNode(contextMenu.nodeId)}
              >
                <Plus className="mr-2 h-3 w-3" /> Add Direct Report
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start text-xs"
                onClick={() => addPeerNode(contextMenu.nodeId)}
              >
                <Plus className="mr-2 h-3 w-3" /> Add Peer
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start text-xs"
                onClick={() => {
                  duplicateNodesAndEdges([contextMenu.nodeId]);
                  setContextMenu(null);
                }}
              >
                <Copy className="mr-2 h-3 w-3" /> Duplicate
              </Button>
              <Button
                variant="ghost"
                className="text-destructive hover:bg-destructive hover:text-destructive-foreground w-full justify-start text-xs"
                onClick={() => handleDeleteNode(contextMenu.nodeId)}
              >
                <Trash2 className="mr-2 h-3 w-3" /> Delete
              </Button>
              {selectedNodeIds.length > 1 && (
                <Button
                  variant="ghost"
                  className="w-full justify-start text-xs"
                  onClick={handleGroup}
                >
                  <Folder className="mr-2 h-3 w-3" /> Group {selectedNodeIds.length} nodes
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

        {/* Right Inspector */}
        <GlassCard className="min-h-0 p-0">
          <BuilderCanvasInspector
            selectedNodeData={selectedNodeData}
            selectedEdgeData={selectedEdgeData}
            hasSelectedEdge={Boolean(selectedEdge)}
            updateSelectedNode={updateSelectedNode}
            updateSelectedEdgeType={updateSelectedEdgeType}
            updateSelectedEdgeLineStyle={updateSelectedEdgeLineStyle}
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

  if (!isAdmin && !isSuperuser) {
    return <Navigate to="/organigrama" replace />;
  }

  return (
    <ReactFlowProvider>
      <BuilderCanvas />
    </ReactFlowProvider>
  );
};
