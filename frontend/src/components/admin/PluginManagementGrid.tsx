import React from "react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { IconWell } from "@/components/ui/IconWell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Database, Settings, ExternalLink, Puzzle } from "lucide-react";
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
        <Loader2 className="text-primary h-8 w-8 animate-spin" />
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
    <TooltipProvider delayDuration={200}>
      <div
        className="grid gap-6"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(22rem, 1fr))" }}
      >
        {/* fallow-ignore-next-line complexity */}
        {plugins.map((plugin) => (
          <GlassCard key={plugin.id} className="relative overflow-hidden">
            <div className="p-6 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <IconWell tone="accent">
                    <Puzzle className="h-4 w-4" />
                  </IconWell>
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-xl font-semibold">{plugin.verbose_name}</h3>
                    <div className="text-muted-foreground flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        v{plugin.version}
                      </Badge>
                      <StatusBadge
                        variant={plugin.is_enabled ? "approved" : "cancelled"}
                        label={plugin.is_enabled ? "Active" : "Inactive"}
                        isCompact
                      />
                    </div>
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
              <p className="text-muted-foreground line-clamp-3 text-sm">
                {plugin.description || "No description provided."}
              </p>
            </div>
            <div className="bg-muted/50 flex flex-wrap gap-2 border-t px-6 py-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
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
                </TooltipTrigger>
                <TooltipContent>
                  Creates the database tables this plugin needs. Safe to run again.
                </TooltipContent>
              </Tooltip>
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
                  className="text-primary h-8 gap-1 text-xs"
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
    </TooltipProvider>
  );
};
