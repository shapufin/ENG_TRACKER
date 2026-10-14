/** Custom chart viewer — renders a published org chart for end users. */
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useReactFlow,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  ChevronRight,
  ChevronDown,
  Briefcase,
  Building,
  Building2,
  Globe,
  Heading,
  HelpCircle,
  MapPin,
  Tag,
  User,
  UserX,
  Users,
  Network,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Input } from "@/components/ui/input";
import { OrgChartToolbar } from "./OrgChartToolbar";
import { builderEdgeTypes } from "./BuilderEdge";
import { builderEdgeProps } from "./builderEdgeHelpers";
import { CONTAINER_SHAPE_TYPES, orderNodesParentFirst } from "../pages/groupHelpers";
import {
  nodeMatches,
  filterHierarchy,
  getInitials,
  COLOR_ACCENT_CLASSES,
  SHAPE_GEOMETRY_CLASSES,
  BORDER_STYLE_CLASSES,
  buildParentMap,
  exportCanvasToPng,
} from "./viewerHelpers";
import type { OrgChart, DraftPayload, OrgChartNode, OrgChartEdge, ShapeType } from "../types";

interface ViewerNodeData extends Record<string, unknown> {
  shape_type: ShapeType;
  display_name: string;
  role_title?: string;
  department_label?: string;
  subtitle?: string;
  status: string;
  style_key?: string;
  custom_fields?: Record<string, unknown>;
  width: number;
  height: number;
  highlighted?: boolean;
  hasChildren?: boolean;
  isExpanded?: boolean;
}

const DEFAULT_WIDTH = 180;
const DEFAULT_HEIGHT = 80;

const SHAPE_LABELS: Record<ShapeType, string> = {
  person: "Person",
  position: "Position",
  vacant: "Vacant",
  external: "External",
  department: "Department",
  division: "Division",
  team: "Team",
  location: "Location",
  label: "Label",
  section: "Section",
  placeholder: "Placeholder",
};

const SHAPE_STYLES: Record<ShapeType, string> = {
  person:
    "bg-card/95 border-blue-200 text-foreground hover:border-blue-400 dark:border-blue-900/60 dark:hover:border-blue-700",
  position:
    "bg-card/95 border-emerald-200 text-foreground hover:border-emerald-400 dark:border-emerald-900/60 dark:hover:border-emerald-700",
  vacant:
    "bg-amber-50/50 border-amber-300 border-dashed text-foreground hover:border-amber-400 dark:bg-amber-950/20 dark:border-amber-700",
  external:
    "bg-card/95 border-purple-200 text-foreground hover:border-purple-400 dark:border-purple-900/60 dark:hover:border-purple-700",
  department:
    "bg-card/95 border-slate-300 text-foreground hover:border-slate-400 dark:border-slate-700",
  division:
    "bg-card/95 border-indigo-200 text-foreground hover:border-indigo-400 dark:border-indigo-900/60",
  team: "bg-card/95 border-sky-200 text-foreground hover:border-sky-400 dark:border-sky-900/60",
  location:
    "bg-card/95 border-cyan-200 text-foreground hover:border-cyan-400 dark:border-cyan-900/60",
  label:
    "bg-transparent border-dashed border-muted-foreground/60 text-muted-foreground hover:border-foreground dark:text-slate-400",
  section:
    "bg-slate-50/70 border-2 border-dashed border-slate-300 text-slate-900 dark:bg-slate-950/30 dark:border-slate-700 dark:text-slate-100",
  placeholder: "bg-muted/40 border-dashed border-border text-foreground hover:border-primary",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  vacant: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  planned: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  archived: "bg-muted text-muted-foreground dark:bg-muted/30 dark:text-muted-foreground",
};

const SHAPE_ICONS: Record<ShapeType, React.ReactNode> = {
  person: <User className="h-4 w-4" />,
  position: <Briefcase className="h-4 w-4" />,
  vacant: <UserX className="h-4 w-4" />,
  external: <Globe className="h-4 w-4" />,
  department: <Building className="h-4 w-4" />,
  division: <Building2 className="h-4 w-4" />,
  team: <Users className="h-4 w-4" />,
  location: <MapPin className="h-4 w-4" />,
  label: <Tag className="h-4 w-4" />,
  section: <Heading className="h-4 w-4" />,
  placeholder: <HelpCircle className="h-4 w-4" />,
};

const ViewerNode: React.FC<NodeProps> = ({ data }) => {
  const nodeData = data as unknown as ViewerNodeData;
  const isVacantPosition = nodeData.shape_type === "position" && nodeData.status === "vacant";
  const colorTheme = (nodeData.custom_fields?.color_theme as string) || nodeData.style_key;
  const customAccent = colorTheme ? COLOR_ACCENT_CLASSES[colorTheme] : undefined;
  const style =
    customAccent ||
    (isVacantPosition ? SHAPE_STYLES.vacant : SHAPE_STYLES[nodeData.shape_type]) ||
    SHAPE_STYLES.person;
  const width = nodeData.width ?? DEFAULT_WIDTH;
  const height = nodeData.height ?? DEFAULT_HEIGHT;
  const isContainer = CONTAINER_SHAPE_TYPES.has(nodeData.shape_type);
  const hasChildren = nodeData.hasChildren ?? false;
  const isExpanded = nodeData.isExpanded ?? true;

  const shapeGeometry = (nodeData.custom_fields?.shape_geometry as string) || "rounded";
  const borderStyle = (nodeData.custom_fields?.border_style as string) || "solid";
  const geometryClass = isContainer
    ? "rounded-lg"
    : SHAPE_GEOMETRY_CLASSES[shapeGeometry] || SHAPE_GEOMETRY_CLASSES.rounded;
  const borderStyleClass = BORDER_STYLE_CLASSES[borderStyle] || BORDER_STYLE_CLASSES.solid;

  return (
    <div
      className={cn(
        "relative border shadow-xs transition-shadow",
        geometryClass,
        borderStyleClass,
        isContainer
          ? "flex h-full w-full flex-col border-2 border-dashed"
          : "flex h-full w-full flex-col justify-center",
        style,
        nodeData.highlighted && "ring-2 ring-yellow-400 ring-offset-1"
      )}
      style={{ width: isContainer ? "100%" : width, height: isContainer ? "100%" : height }}
      role="treeitem"
      tabIndex={0}
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-label={`${SHAPE_LABELS[nodeData.shape_type]}, ${nodeData.display_name}`}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      {isContainer ? (
        <>
          <div className="flex h-8 w-full items-center gap-1.5 border-b border-current/20 px-2 text-xs font-semibold uppercase">
            {SHAPE_ICONS[nodeData.shape_type]}
            <span className="truncate" title={nodeData.display_name}>
              {nodeData.display_name}
            </span>
          </div>
          <div className="flex-1" />
        </>
      ) : (
        <div className="flex h-full w-full items-center gap-2.5 px-3 py-1.5">
          {["person", "position", "vacant", "external"].includes(nodeData.shape_type) ? (
            <div className="relative shrink-0">
              <div className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold shadow-xs">
                {getInitials(nodeData.display_name)}
              </div>
            </div>
          ) : (
            <div className="bg-muted text-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
              {SHAPE_ICONS[nodeData.shape_type]}
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col justify-center text-left">
            <div className="text-muted-foreground flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase">
              {hasChildren && (
                <span className="shrink-0" aria-hidden="true">
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </span>
              )}
              <span>{SHAPE_LABELS[nodeData.shape_type]}</span>
            </div>
            <span
              className="text-foreground truncate text-xs leading-tight font-semibold"
              title={nodeData.display_name}
            >
              {nodeData.display_name}
            </span>
            {nodeData.role_title && (
              <span
                className="text-muted-foreground truncate text-[11px] leading-tight"
                title={nodeData.role_title}
              >
                {nodeData.role_title}
              </span>
            )}
            {nodeData.department_label && (
              <span
                className="text-muted-foreground/75 truncate text-[10px] leading-tight"
                title={nodeData.department_label}
              >
                {nodeData.department_label}
              </span>
            )}
            <span
              className={cn(
                "py-0.2 mt-0.5 inline-block w-fit rounded-full px-1.5 text-[9px] font-medium",
                STATUS_STYLES[nodeData.status] || STATUS_STYLES.active
              )}
            >
              {nodeData.status}
            </span>
          </div>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
};

const nodeTypes: NodeTypes = { viewerNode: ViewerNode };

function buildHierarchy(
  nodes: OrgChartNode[],
  edges: OrgChartEdge[]
): { roots: OrgChartNode[]; childrenMap: Map<string, OrgChartNode[]> } {
  const childrenMap = new Map<string, OrgChartNode[]>();
  const parentMap = buildParentMap(nodes, edges);

  const roots: OrgChartNode[] = [];
  for (const n of nodes) {
    const parent = parentMap.get(n.node_uuid);
    if (!parent || !nodes.some((x) => x.node_uuid === parent)) {
      roots.push(n);
      continue;
    }
    const siblings = childrenMap.get(parent) ?? [];
    siblings.push(n);
    childrenMap.set(parent, siblings);
  }

  for (const [, siblings] of childrenMap) {
    siblings.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }
  roots.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return { roots, childrenMap };
}

const MobileNode: React.FC<{
  node: OrgChartNode;
  childrenMap: Map<string, OrgChartNode[]>;
  depth: number;
}> = ({ node, childrenMap, depth }) => {
  const [expanded, setExpanded] = useState(true);
  const children = childrenMap.get(node.node_uuid) ?? [];
  const hasChildren = children.length > 0;

  return (
    <li role="treeitem" aria-level={depth + 1} aria-expanded={hasChildren ? expanded : undefined}>
      <div
        className="flex items-center gap-2 py-1.5"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
            className="text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <span className="text-muted-foreground shrink-0" aria-hidden="true">
          {SHAPE_ICONS[node.shape_type]}
        </span>
        <span className="flex-1 text-sm">{node.display_name}</span>
        {node.role_title && (
          <span className="text-muted-foreground text-xs">{node.role_title}</span>
        )}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            STATUS_STYLES[node.status] || STATUS_STYLES.active
          )}
        >
          {node.status}
        </span>
      </div>
      {hasChildren && expanded && (
        <ul role="group">
          {children.map((child) => (
            <MobileNode
              key={child.node_uuid}
              node={child}
              childrenMap={childrenMap}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

const CustomChartMobileList: React.FC<{
  payload: DraftPayload;
  onSwitchToGraph?: () => void;
}> = ({ payload, onSwitchToGraph }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const fullHierarchy = useMemo(
    () => buildHierarchy(payload.nodes, payload.edges),
    [payload.nodes, payload.edges]
  );

  // When searching, rebuild the hierarchy from the filtered node set so
  // non-matching descendants of a matched node are pruned (parity with the
  // desktop viewer, which applies searchFilteredIds to both nodes and edges).
  const { roots, childrenMap } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return fullHierarchy;
    const { filteredNodes } = filterHierarchy(payload.nodes, payload.edges, q);
    return buildHierarchy(filteredNodes, payload.edges);
  }, [fullHierarchy, payload.nodes, payload.edges, searchQuery]);

  if (fullHierarchy.roots.length === 0) {
    return (
      <div className="text-muted-foreground px-4 py-8 text-center text-sm">
        No chart data available.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Input
          placeholder="Search by name, title, or department..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="text-sm"
          aria-label="Search chart"
        />
        {onSwitchToGraph && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSwitchToGraph}
            className="shrink-0 gap-1.5 text-xs font-medium"
            title="Switch to interactive graph canvas with zoom & pan"
            aria-label="Switch to graph view"
          >
            <Network className="text-primary h-3.5 w-3.5" />
            <span>Graph View</span>
          </Button>
        )}
      </div>
      {roots.length === 0 ? (
        <div className="text-muted-foreground px-4 py-8 text-center text-sm">
          No matching nodes found.
        </div>
      ) : (
        <ul role="tree" aria-label="Organizational chart (mobile list view)" className="divide-y">
          {roots.map((root) => (
            <MobileNode key={root.node_uuid} node={root} childrenMap={childrenMap} depth={0} />
          ))}
        </ul>
      )}
    </div>
  );
};

function layoutGraph(nodes: OrgChartNode[], edges: OrgChartEdge[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    g.setNode(n.node_uuid, {
      width: n.width ?? DEFAULT_WIDTH,
      height: n.height ?? DEFAULT_HEIGHT,
    });
  }

  for (const e of edges) {
    if (e.edge_type === "reports_to" || e.edge_type === "contains") {
      g.setEdge(e.source_uuid, e.target_uuid);
    }
  }

  try {
    dagre.layout(g);
  } catch {
    // Dagre can fail on cycles; continue with unpositioned nodes.
  }

  const hasVisualGroups = nodes.some((node) => node.group_uuid);
  const baseNodes: Node<ViewerNodeData>[] = hasVisualGroups
    ? (orderNodesParentFirst(
        nodes.map((n) => {
          const isContainer = CONTAINER_SHAPE_TYPES.has(n.shape_type);
          const width = n.width ?? DEFAULT_WIDTH;
          const height = n.height ?? DEFAULT_HEIGHT;
          return {
            id: n.node_uuid,
            type: "viewerNode",
            position: { x: n.position_x, y: n.position_y },
            ...(isContainer ? { style: { width, height }, zIndex: 0 } : { width, height }),
            parentId: n.group_uuid ?? undefined,
            extent: n.group_uuid ? ("parent" as const) : undefined,
            data: {
              shape_type: n.shape_type,
              display_name: n.display_name,
              role_title: n.role_title,
              department_label: n.department_label,
              subtitle: n.subtitle,
              status: n.status,
              style_key: n.style_key,
              custom_fields: n.custom_fields ?? {},
              width,
              height,
              highlighted: false,
            },
          } as Node<ViewerNodeData>;
        })
      ) as Node<ViewerNodeData>[])
    : nodes.map((n) => {
        const width = n.width ?? DEFAULT_WIDTH;
        const height = n.height ?? DEFAULT_HEIGHT;
        const pos = g.node(n.node_uuid);
        return {
          id: n.node_uuid,
          type: "viewerNode",
          position: pos ? { x: pos.x - width / 2, y: pos.y - height / 2 } : { x: 0, y: 0 },
          width,
          height,
          data: {
            shape_type: n.shape_type,
            display_name: n.display_name,
            role_title: n.role_title,
            department_label: n.department_label,
            subtitle: n.subtitle,
            status: n.status,
            style_key: n.style_key,
            custom_fields: n.custom_fields ?? {},
            width,
            height,
            highlighted: false,
          },
        } as Node<ViewerNodeData>;
      });

  const baseEdges: Edge[] = edges.map((e) => {
    return {
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
    };
  });

  return { baseNodes, baseEdges };
}

const CustomChartDesktopInner: React.FC<{
  payload: DraftPayload;
  isLandscape?: boolean;
  isMobile?: boolean;
  onSwitchToList?: () => void;
}> = ({ payload, isLandscape, isMobile, onSwitchToList }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(payload.nodes.map((n) => n.node_uuid))
  );
  const reactFlow = useReactFlow();

  const { baseNodes, baseEdges } = useMemo(
    () => layoutGraph(payload.nodes, payload.edges),
    [payload.nodes, payload.edges]
  );

  const { childrenMap } = useMemo(
    () => buildHierarchy(payload.nodes, payload.edges),
    [payload.nodes, payload.edges]
  );

  const allNodeIds = useMemo(() => new Set(payload.nodes.map((n) => n.node_uuid)), [payload.nodes]);

  const visibleIds = useMemo(() => {
    const hidden = new Set<string>();
    const hideChildren = (id: string) => {
      for (const child of childrenMap.get(id) ?? []) {
        hidden.add(child.node_uuid);
        hideChildren(child.node_uuid);
      }
    };
    for (const id of allNodeIds) {
      if ((childrenMap.get(id) ?? []).length > 0 && !expandedIds.has(id)) {
        hideChildren(id);
      }
    }
    return new Set([...allNodeIds].filter((id) => !hidden.has(id)));
  }, [allNodeIds, childrenMap, expandedIds]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedIds(new Set(allNodeIds));
  }, [allNodeIds]);

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if ((childrenMap.get(node.id) ?? []).length > 0) {
        toggleExpand(node.id);
      }
    },
    [childrenMap, toggleExpand]
  );

  const matchIds = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return new Set<string>();
    return new Set(payload.nodes.filter((n) => nodeMatches(n, q)).map((n) => n.node_uuid));
  }, [payload.nodes, searchQuery]);

  // When searching, filter to matching nodes + ancestors (parity with live chart).
  const searchFilteredIds = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return null;
    const { visibleIds } = filterHierarchy(payload.nodes, payload.edges, q);
    return visibleIds;
  }, [payload.nodes, payload.edges, searchQuery]);

  const nodes = useMemo(
    () =>
      baseNodes
        .filter(
          (n) => visibleIds.has(n.id) && (searchFilteredIds === null || searchFilteredIds.has(n.id))
        )
        .map((n) => ({
          ...n,
          data: {
            ...n.data,
            hasChildren: (childrenMap.get(n.id) ?? []).length > 0,
            isExpanded: expandedIds.has(n.id),
            highlighted: matchIds.has(n.id),
          },
        })),
    [baseNodes, visibleIds, searchFilteredIds, childrenMap, expandedIds, matchIds]
  );

  const edges = useMemo(
    () =>
      baseEdges.filter(
        (e) =>
          visibleIds.has(e.source) &&
          visibleIds.has(e.target) &&
          (searchFilteredIds === null ||
            (searchFilteredIds.has(e.source) && searchFilteredIds.has(e.target)))
      ),
    [baseEdges, visibleIds, searchFilteredIds]
  );

  const [is3D, setIs3D] = useState(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const handleZoomIn = useCallback(() => reactFlow.zoomIn(), [reactFlow]);
  const handleZoomOut = useCallback(() => reactFlow.zoomOut(), [reactFlow]);
  const handleFitView = useCallback(() => reactFlow.fitView({ padding: 0.2 }), [reactFlow]);

  const handleExportPng = useCallback(async () => {
    const success = await exportCanvasToPng(canvasRef.current, "custom-organigrama.png");
    if (!success) {
      alert("Failed to export image.");
    }
  }, []);

  return (
    <div className="space-y-2" aria-label="Custom organizational chart">
      <OrgChartToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitView={handleFitView}
        is3D={is3D}
        onToggle3D={() => setIs3D((prev) => !prev)}
        onExportPng={handleExportPng}
        onSwitchToList={onSwitchToList}
      />
      <div
        ref={canvasRef}
        className={cn(
          "w-full overflow-hidden rounded-lg border [perspective:1400px]",
          isLandscape
            ? "h-[calc(100dvh-5.5rem)]"
            : isMobile
              ? "h-[calc(100dvh-10rem)]"
              : "h-[calc(100vh-16rem)]"
        )}
      >
        <div
          className="h-full w-full transition-transform duration-500 ease-out"
          style={{
            transform: is3D ? "rotateX(22deg) rotateZ(-3deg) scale(0.92)" : "none",
            transformStyle: "preserve-3d",
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={builderEdgeTypes}
            fitView
            onNodeClick={handleNodeClick}
            panOnDrag={true}
            zoomOnPinch={true}
            preventScrolling={false}
            attributionPosition="bottom-left"
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
};

const CustomChartDesktop: React.FC<{
  payload: DraftPayload;
  isLandscape?: boolean;
  isMobile?: boolean;
  onSwitchToList?: () => void;
}> = ({ payload, isLandscape, isMobile, onSwitchToList }) => {
  return (
    <ReactFlowProvider>
      <CustomChartDesktopInner
        payload={payload}
        isLandscape={isLandscape}
        isMobile={isMobile}
        onSwitchToList={onSwitchToList}
      />
    </ReactFlowProvider>
  );
};

export interface CustomChartViewerProps {
  chart: OrgChart;
  payload: DraftPayload;
}

export const CustomChartViewer: React.FC<CustomChartViewerProps> = ({ chart, payload }) => {
  const isSmallScreen = useMediaQuery("(max-width: 767px)");
  const isLandscape = useMediaQuery("(orientation: landscape) and (max-height: 550px)");
  const [userModeOverride, setUserModeOverride] = useState<"graph" | "list" | null>(null);

  // Automatically reset user override when orientation changes (e.g. rotating phone into landscape opens graph)
  const [prevLandscape, setPrevLandscape] = useState(isLandscape);
  if (prevLandscape !== isLandscape) {
    setPrevLandscape(isLandscape);
    setUserModeOverride(null);
  }

  // In landscape mode or desktop, automatically open in interactive graph view.
  // In portrait mobile, default to list unless user toggles graph view.
  const isGraphMode =
    userModeOverride === "graph" || (userModeOverride === null && (isLandscape || !isSmallScreen));

  return (
    <div className="space-y-2">
      {!isGraphMode ? (
        <CustomChartMobileList
          payload={payload}
          onSwitchToGraph={() => setUserModeOverride("graph")}
        />
      ) : (
        <CustomChartDesktop
          key={chart.id}
          payload={payload}
          isLandscape={isLandscape}
          isMobile={isSmallScreen}
          onSwitchToList={isSmallScreen ? () => setUserModeOverride("list") : undefined}
        />
      )}
    </div>
  );
};
