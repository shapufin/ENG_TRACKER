import React from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Database,
  Settings,
  ExternalLink,
  Puzzle,
} from "lucide-react";
import type { PluginRecord } from "@/services/pluginService";

interface PluginManagementGridProps {
  plugins: PluginRecord[];
  isLoading: boolean;
  initializingId: number | null;
  onToggle: (id: number) => void;
  onInitialize: (id: number) => void;
  onConfigure: (plugin: PluginRecord) => void;
  onLink: (plugin: PluginRecord) => void;
}

export const PluginManagementGrid: React.FC<PluginManagementGridProps> = ({
  plugins,
  isLoading,
  initializingId,
  onToggle,
  onInitialize,
  onConfigure,
  onLink,
}) => {
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (plugins.length === 0) {
    return (
      <EmptyState
        icon={Puzzle}
        title="No plugins found"
        description='Click "Discover Plugins" to scan for available plugins.'
      />
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3">
      {/* fallow-ignore-next-line complexity */}
      {plugins.map((plugin) => (
        <GlassCard key={plugin.id} className="relative overflow-hidden" isHoverLift={true}>
          <div className="p-6 pb-3">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h3 className="text-xl font-semibold">{plugin.verbose_name}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    v{plugin.version}
                  </Badge>
                  {plugin.is_enabled ? (
                    <span className="flex items-center gap-1 text-[10px] text-success">
                      <CheckCircle2 className="h-3 w-3" /> Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <XCircle className="h-3 w-3" /> Inactive
                    </span>
                  )}
                </div>
              </div>
              <Switch
                checked={plugin.is_enabled}
                onCheckedChange={() => onToggle(plugin.id)}
                aria-label={`Toggle ${plugin.verbose_name}`}
              />
            </div>
          </div>
          <div className="px-6 pb-4">
            <p className="line-clamp-3 text-sm text-muted-foreground">
              {plugin.description || "No description provided."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 border-t bg-muted/50 px-6 py-3">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => onInitialize(plugin.id)}
              disabled={initializingId === plugin.id}
              aria-label={`Initialize tables for ${plugin.verbose_name}`}
            >
              {initializingId === plugin.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Database className="h-3.5 w-3.5" />
              )}
              Initialize
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => onConfigure(plugin)}
              aria-label={`Configure ${plugin.verbose_name}`}
            >
              <Settings className="h-3.5 w-3.5" /> Config
            </Button>
            {plugin.is_enabled && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs text-primary"
                onClick={() => onLink(plugin)}
                aria-label={`Open ${plugin.verbose_name} page`}
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </Button>
            )}
          </div>
        </GlassCard>
      ))}
    </div>
  );
};
