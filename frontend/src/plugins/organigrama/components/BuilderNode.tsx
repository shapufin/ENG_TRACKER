/** Custom React Flow node for the organigrama builder. */
import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import {
  Briefcase,
  Building,
  Building2,
  Folder,
  Globe,
  HelpCircle,
  MapPin,
  Tag,
  User,
  UserX,
  Users,
} from "lucide-react";
import type { ShapeType, BuilderNodeData } from "../types";
import { CONTAINER_SHAPE_TYPES } from "../pages/groupHelpers";

const DEFAULT_WIDTH = 180;
const DEFAULT_HEIGHT = 80;

type ShapeLayout = "card" | "wide" | "minimal" | "group";

interface ShapeConfig {
  label: string;
  icon: React.ReactNode;
  className: string;
  layout: ShapeLayout;
}

const SHAPE_CONFIG: Record<ShapeType, ShapeConfig> = {
  person: {
    label: "Person",
    icon: <User className="h-4 w-4" />,
    className:
      "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-100",
    layout: "card",
  },
  position: {
    label: "Position",
    icon: <Briefcase className="h-4 w-4" />,
    className:
      "bg-green-50 border-green-200 text-green-900 dark:bg-green-950/40 dark:border-green-800 dark:text-green-100",
    layout: "card",
  },
  vacant: {
    label: "Vacant",
    icon: <UserX className="h-4 w-4" />,
    className:
      "bg-amber-50 border-amber-200 border-dashed text-amber-900 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-100",
    layout: "card",
  },
  external: {
    label: "External",
    icon: <Globe className="h-4 w-4" />,
    className:
      "bg-purple-50 border-purple-200 text-purple-900 dark:bg-purple-950/40 dark:border-purple-800 dark:text-purple-100",
    layout: "card",
  },
  department: {
    label: "Department",
    icon: <Building className="h-4 w-4" />,
    className:
      "bg-slate-100 border-slate-300 text-slate-900 dark:bg-slate-800/60 dark:border-slate-600 dark:text-slate-100",
    layout: "wide",
  },
  division: {
    label: "Division",
    icon: <Building2 className="h-4 w-4" />,
    className:
      "bg-indigo-50 border-indigo-200 text-indigo-900 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-100",
    layout: "wide",
  },
  team: {
    label: "Team",
    icon: <Users className="h-4 w-4" />,
    className:
      "bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-100",
    layout: "wide",
  },
  location: {
    label: "Location",
    icon: <MapPin className="h-4 w-4" />,
    className:
      "bg-cyan-50 border-cyan-200 text-cyan-900 dark:bg-cyan-950/40 dark:border-cyan-800 dark:text-cyan-100",
    layout: "wide",
  },
  label: {
    label: "Label",
    icon: <Tag className="h-3 w-3" />,
    className:
      "bg-transparent border-dashed border-muted-foreground text-muted-foreground dark:text-slate-400",
    layout: "minimal",
  },
  section: {
    label: "Group",
    icon: <Folder className="h-4 w-4" />,
    className:
      "bg-slate-50/80 border-2 border-dashed border-slate-400 text-slate-900 dark:bg-slate-950/40 dark:border-slate-600 dark:text-slate-100",
    layout: "group",
  },
  placeholder: {
    label: "Placeholder",
    icon: <HelpCircle className="h-4 w-4" />,
    className: "bg-muted/50 border-border text-foreground dark:bg-muted/60 dark:border-border ",
    layout: "card",
  },
};

const CardLayout: React.FC<{
  config: ShapeConfig;
  nodeData: BuilderNodeData;
}> = ({ config, nodeData }) => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 py-1">
    <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase text-muted-foreground">
      {config.icon}
      <span>{config.label}</span>
    </div>
    <span className="text-center text-sm font-semibold leading-tight">{nodeData.display_name}</span>
    {nodeData.role_title && (
      <span className="text-xs text-muted-foreground">{nodeData.role_title}</span>
    )}
  </div>
);

const WideLayout: React.FC<{
  config: ShapeConfig;
  nodeData: BuilderNodeData;
}> = ({ config, nodeData }) => (
  <div className="flex h-full w-full items-center gap-2 px-3">
    <span className="shrink-0 text-muted-foreground">{config.icon}</span>
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="text-[10px] font-medium uppercase text-muted-foreground">
        {config.label}
      </span>
      <span className="truncate text-sm font-semibold" title={nodeData.display_name}>
        {nodeData.display_name}
      </span>
      {nodeData.role_title && (
        <span className="truncate text-xs text-muted-foreground" title={nodeData.role_title}>
          {nodeData.role_title}
        </span>
      )}
    </div>
  </div>
);

const MinimalLayout: React.FC<{
  config: ShapeConfig;
  nodeData: BuilderNodeData;
}> = ({ config, nodeData }) => (
  <div className="flex h-full w-full items-center justify-center gap-1.5 px-2">
    <span className="text-muted-foreground">{config.icon}</span>
    <span className="text-sm font-semibold">{nodeData.display_name}</span>
  </div>
);

const GroupLayout: React.FC<{
  config: ShapeConfig;
  nodeData: BuilderNodeData;
}> = ({ config, nodeData }) => (
  <div className="flex h-full w-full flex-col">
    <div className="builder-group-drag-handle flex h-8 w-full cursor-move items-center gap-1.5 border-b border-slate-300 px-2 text-[10px] font-semibold uppercase text-slate-700 dark:border-slate-600 dark:text-slate-300">
      {config.icon}
      <span className="truncate" title={nodeData.display_name}>
        {nodeData.display_name}
      </span>
    </div>
    <div className="flex-1" />
  </div>
);

const LAYOUTS: Record<ShapeLayout, React.FC<{ config: ShapeConfig; nodeData: BuilderNodeData }>> = {
  card: CardLayout,
  wide: WideLayout,
  minimal: MinimalLayout,
  group: GroupLayout,
};

export const BuilderNode: React.FC<NodeProps> = (props) => {
  const { data, selected, width, height } = props;
  const nodeData = data as unknown as BuilderNodeData;
  const config = SHAPE_CONFIG[nodeData.shape_type] || SHAPE_CONFIG.person;
  const Layout = LAYOUTS[config.layout] || CardLayout;
  const isVacantPosition = nodeData.shape_type === "position" && nodeData.status === "vacant";
  const styleClass = isVacantPosition ? SHAPE_CONFIG.vacant.className : config.className;

  // Container nodes use style:{width,height} on the React Flow node wrapper
  // (.react-flow__node). The inner component should fill the wrapper with
  // 100% so the correct dimensions are visible immediately (before React
  // Flow measures and populates width/height in NodeProps). Non-container
  // nodes use top-level width/height which are available immediately.
  const isContainer = CONTAINER_SHAPE_TYPES.has(nodeData.shape_type);
  const resolvedWidth = isContainer ? "100%" : (width ?? DEFAULT_WIDTH);
  const resolvedHeight = isContainer ? "100%" : (height ?? DEFAULT_HEIGHT);

  return (
    <div
      className={cn(
        "rounded-lg border px-1 py-1 shadow-sm transition-shadow",
        styleClass,
        selected && "ring-2 ring-primary ring-offset-1"
      )}
      style={{ width: resolvedWidth, height: resolvedHeight }}
      role="treeitem"
      tabIndex={0}
      aria-label={`${config.label}, ${nodeData.display_name}`}
    >
      <Handle type="target" position={Position.Top} className="!h-3 !w-3" />
      <Layout config={config} nodeData={nodeData} />
      <Handle type="source" position={Position.Bottom} className="!h-3 !w-3" />
    </div>
  );
};
