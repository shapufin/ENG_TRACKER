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
  Plus,
  Tag,
  User,
  UserX,
  Users,
} from "lucide-react";
import type { ShapeType, BuilderNodeData } from "../types";
import { CONTAINER_SHAPE_TYPES } from "../pages/groupHelpers";
import { useBuilderActions } from "./BuilderActionsContext";
import {
  getInitials,
  COLOR_ACCENT_CLASSES,
  SHAPE_GEOMETRY_CLASSES,
  BORDER_STYLE_CLASSES,
} from "./viewerHelpers";

const DEFAULT_WIDTH = 210;
const DEFAULT_HEIGHT = 88;

type ShapeLayout = "person" | "wide" | "minimal" | "group";

interface ShapeConfig {
  label: string;
  icon: React.ReactNode;
  className: string;
  accentBar?: string;
  layout: ShapeLayout;
}

const SHAPE_CONFIG: Record<ShapeType, ShapeConfig> = {
  person: {
    label: "Person",
    icon: <User className="h-3.5 w-3.5" />,
    className:
      "bg-card/95 border-blue-200 text-foreground hover:border-blue-400 dark:border-blue-900/60 dark:hover:border-blue-700",
    accentBar: "bg-blue-500",
    layout: "person",
  },
  position: {
    label: "Position",
    icon: <Briefcase className="h-3.5 w-3.5" />,
    className:
      "bg-card/95 border-emerald-200 text-foreground hover:border-emerald-400 dark:border-emerald-900/60 dark:hover:border-emerald-700",
    accentBar: "bg-emerald-500",
    layout: "person",
  },
  vacant: {
    label: "Vacant",
    icon: <UserX className="h-3.5 w-3.5" />,
    className:
      "bg-amber-50/50 border-amber-300 border-dashed text-foreground hover:border-amber-400 dark:bg-amber-950/20 dark:border-amber-700",
    accentBar: "bg-amber-500",
    layout: "person",
  },
  external: {
    label: "External",
    icon: <Globe className="h-3.5 w-3.5" />,
    className:
      "bg-card/95 border-purple-200 text-foreground hover:border-purple-400 dark:border-purple-900/60 dark:hover:border-purple-700",
    accentBar: "bg-purple-500",
    layout: "person",
  },
  department: {
    label: "Department",
    icon: <Building className="h-3.5 w-3.5" />,
    className:
      "bg-card/95 border-slate-300 text-foreground hover:border-slate-400 dark:border-slate-700",
    accentBar: "bg-indigo-500",
    layout: "wide",
  },
  division: {
    label: "Division",
    icon: <Building2 className="h-3.5 w-3.5" />,
    className:
      "bg-card/95 border-indigo-200 text-foreground hover:border-indigo-400 dark:border-indigo-900/60",
    accentBar: "bg-indigo-600",
    layout: "wide",
  },
  team: {
    label: "Team",
    icon: <Users className="h-3.5 w-3.5" />,
    className:
      "bg-card/95 border-sky-200 text-foreground hover:border-sky-400 dark:border-sky-900/60",
    accentBar: "bg-sky-500",
    layout: "wide",
  },
  location: {
    label: "Location",
    icon: <MapPin className="h-3.5 w-3.5" />,
    className:
      "bg-card/95 border-cyan-200 text-foreground hover:border-cyan-400 dark:border-cyan-900/60",
    accentBar: "bg-cyan-500",
    layout: "wide",
  },
  label: {
    label: "Label",
    icon: <Tag className="h-3 w-3" />,
    className:
      "bg-transparent border-dashed border-muted-foreground/60 text-muted-foreground hover:border-foreground dark:text-slate-400",
    layout: "minimal",
  },
  section: {
    label: "Group",
    icon: <Folder className="h-3.5 w-3.5" />,
    className:
      "bg-slate-50/70 border-2 border-dashed border-slate-300 text-slate-900 dark:bg-slate-950/30 dark:border-slate-700 dark:text-slate-100",
    layout: "group",
  },
  placeholder: {
    label: "Placeholder",
    icon: <HelpCircle className="h-3.5 w-3.5" />,
    className: "bg-muted/40 border-dashed border-border text-foreground hover:border-primary",
    layout: "person",
  },
};

const STATUS_INDICATOR: Record<string, string> = {
  active: "bg-emerald-500 ring-emerald-500/30",
  vacant: "bg-amber-500 ring-amber-500/30",
  planned: "bg-sky-500 ring-sky-500/30",
  archived: "bg-slate-400 ring-slate-400/30",
};

const PersonLayout: React.FC<{
  config: ShapeConfig;
  nodeData: BuilderNodeData;
}> = ({ config, nodeData }) => {
  const statusColor = STATUS_INDICATOR[nodeData.status] || STATUS_INDICATOR.active;
  const initials = getInitials(nodeData.display_name);

  return (
    <div className="flex h-full w-full items-center gap-2.5 px-3 py-1.5">
      {/* Avatar with status ring */}
      <div className="relative shrink-0">
        <div className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold shadow-xs">
          {initials}
        </div>
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-950",
            statusColor
          )}
          title={`Status: ${nodeData.status}`}
        />
      </div>

      {/* Details */}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="text-muted-foreground flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase">
          {config.icon}
          <span>{config.label}</span>
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
        {nodeData.subtitle && (
          <span
            className="text-muted-foreground/80 truncate text-[10px] leading-tight italic"
            title={nodeData.subtitle}
          >
            {nodeData.subtitle}
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
        {typeof nodeData.custom_fields?.tech_level === "string" &&
          Boolean(nodeData.custom_fields.tech_level) && (
            <span className="bg-primary/10 text-primary mt-0.5 inline-block w-fit rounded px-1.5 py-0.5 text-[9px] font-semibold">
              {nodeData.custom_fields.tech_level}
            </span>
          )}
      </div>
    </div>
  );
};

const WideLayout: React.FC<{
  config: ShapeConfig;
  nodeData: BuilderNodeData;
}> = ({ config, nodeData }) => (
  <div className="flex h-full w-full flex-col justify-between overflow-hidden">
    {config.accentBar && <div className={cn("h-1 w-full shrink-0", config.accentBar)} />}
    <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-1">
      <div className="bg-muted text-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
        {config.icon}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
          {config.label}
        </span>
        <span
          className="text-foreground truncate text-xs font-semibold"
          title={nodeData.display_name}
        >
          {nodeData.display_name}
        </span>
        {nodeData.role_title && (
          <span className="text-muted-foreground truncate text-[11px]" title={nodeData.role_title}>
            {nodeData.role_title}
          </span>
        )}
      </div>
    </div>
  </div>
);

const MinimalLayout: React.FC<{
  config: ShapeConfig;
  nodeData: BuilderNodeData;
}> = ({ config, nodeData }) => (
  <div className="flex h-full w-full items-center justify-center gap-1.5 px-3">
    <span className="text-muted-foreground">{config.icon}</span>
    <span className="text-muted-foreground text-[10px] uppercase">{config.label}:</span>
    <span className="text-foreground truncate text-xs font-semibold">{nodeData.display_name}</span>
  </div>
);

const GroupLayout: React.FC<{
  config: ShapeConfig;
  nodeData: BuilderNodeData;
}> = ({ config, nodeData }) => (
  <div className="flex h-full w-full flex-col">
    <div className="builder-group-drag-handle bg-muted/60 flex h-7 w-full cursor-move items-center gap-1.5 border-b border-slate-300 px-2 text-[11px] font-semibold text-slate-700 uppercase dark:border-slate-700 dark:text-slate-300">
      {config.icon}
      <span className="truncate" title={nodeData.display_name}>
        {nodeData.display_name}
      </span>
    </div>
    <div className="flex-1" />
  </div>
);

const LAYOUTS: Record<ShapeLayout, React.FC<{ config: ShapeConfig; nodeData: BuilderNodeData }>> = {
  person: PersonLayout,
  wide: WideLayout,
  minimal: MinimalLayout,
  group: GroupLayout,
};

export const BuilderNode: React.FC<NodeProps> = (props) => {
  const { id, data, selected, width, height } = props;
  const nodeData = data as unknown as BuilderNodeData;
  const config = SHAPE_CONFIG[nodeData.shape_type] || SHAPE_CONFIG.person;
  const Layout = LAYOUTS[config.layout] || PersonLayout;
  const isVacantPosition = nodeData.shape_type === "position" && nodeData.status === "vacant";
  const colorTheme = (nodeData.custom_fields?.color_theme as string) || nodeData.style_key;
  const customAccent = colorTheme ? COLOR_ACCENT_CLASSES[colorTheme] : undefined;
  const styleClass =
    customAccent || (isVacantPosition ? SHAPE_CONFIG.vacant.className : config.className);
  const actions = useBuilderActions();

  const isContainer = CONTAINER_SHAPE_TYPES.has(nodeData.shape_type);
  const shapeGeometry = (nodeData.custom_fields?.shape_geometry as string) || "rounded";
  const borderStyle = (nodeData.custom_fields?.border_style as string) || "solid";
  const geometryClass = isContainer
    ? "rounded-lg"
    : SHAPE_GEOMETRY_CLASSES[shapeGeometry] || SHAPE_GEOMETRY_CLASSES.rounded;
  const borderStyleClass = BORDER_STYLE_CLASSES[borderStyle] || BORDER_STYLE_CLASSES.solid;

  const resolvedWidth = isContainer ? "100%" : (width ?? DEFAULT_WIDTH);
  const resolvedHeight = isContainer ? "100%" : (height ?? DEFAULT_HEIGHT);

  const handleAddReportClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    actions.onAddChild?.(id);
  };

  return (
    <div
      className={cn(
        "group relative border shadow-xs transition-all duration-150",
        geometryClass,
        borderStyleClass,
        styleClass,
        selected && "ring-primary shadow-md ring-2 ring-offset-1"
      )}
      style={{ width: resolvedWidth, height: resolvedHeight }}
      role="treeitem"
      tabIndex={0}
      aria-label={`${config.label}, ${nodeData.display_name}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!border-background !bg-muted-foreground !h-3 !w-3 transition-transform group-hover:scale-125"
      />
      <Layout config={config} nodeData={nodeData} />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!border-background !bg-primary !h-3 !w-3 transition-transform group-hover:scale-125"
      />

      {/* On-node [+] quick action to add direct report */}
      {actions.onAddChild && !isContainer && (
        <button
          type="button"
          onClick={handleAddReportClick}
          aria-label={`Add direct report under ${nodeData.display_name}`}
          title="Add direct report"
          className="bg-primary text-primary-foreground absolute -bottom-3 left-1/2 flex h-5 w-5 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full opacity-0 shadow-md transition-all duration-150 group-hover:opacity-100 hover:scale-110"
        >
          <Plus className="h-3 w-3 stroke-[2.5]" />
        </button>
      )}
    </div>
  );
};
