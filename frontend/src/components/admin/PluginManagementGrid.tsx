import React from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingCard } from "@/components/ui/LoadingCard";
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
    return <LoadingCard title="Loading plugins" rows={4} />;
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
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3">
      {/* fallow-ignore-next-line complexity */}
      {plugins.map((plugin) => (
        <GlassCard key={plugin.id} className="flex h-full flex-col">
          <div className="p-4 pb-2">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h3 className="text-base font-semibold">{plugin.verbose_name}</h3>
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-xs uppercase">
                    v{plugin.version}
                  </Badge>
                  {plugin.is_enabled ? (
                    <span className="text-success flex items-center gap-1 text-xs">
                      <CheckCircle2 className="h-3 w-3" /> Active
                    </span>
                  ) : (
                    <span className="text-muted-foreground flex items-center gap-1 text-xs">
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
          <div className="px-4 pb-4">
            <p className="text-muted-foreground line-clamp-3 text-sm">
              {plugin.description || "No description provided."}
            </p>
          </div>
          <div className="border-line-subtle mt-auto flex flex-wrap gap-2 border-t px-4 py-3">
            <Button
              variant="outline"
              size="control-sm"
              className="gap-1"
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
              size="control-sm"
              className="gap-1"
              onClick={() => onConfigure(plugin)}
              aria-label={`Configure ${plugin.verbose_name}`}
            >
              <Settings className="h-3.5 w-3.5" /> Config
            </Button>
            {plugin.is_enabled && (
              <Button
                variant="ghost"
                size="control-sm"
                className="text-primary gap-1"
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
