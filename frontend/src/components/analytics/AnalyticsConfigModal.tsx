import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";

interface AnalyticsConfig {
  id?: number;
  snapshot_frequency: "daily" | "weekly" | "monthly";
  data_retention_days: number;
  enabled_metrics: string[];
  auto_snapshot_enabled: boolean;
  // Insight thresholds
  trend_threshold: number;
  concentration_threshold: number;
  spike_threshold: number;
  backlog_threshold: number;
  status_bottleneck_threshold: number;
}

interface AnalyticsConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const AnalyticsConfigModal: React.FC<AnalyticsConfigModalProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const [config, setConfig] = useState<AnalyticsConfig>({
    snapshot_frequency: "daily",
    data_retention_days: 365,
    enabled_metrics: [],
    auto_snapshot_enabled: true,
    trend_threshold: 0.15,
    concentration_threshold: 0.4,
    spike_threshold: 2.0,
    backlog_threshold: 5,
    status_bottleneck_threshold: 0.3,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/immutability
      fetchConfig();
    }
  }, [open]);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await api.get("plugins/analytics/configuration/current/");
      setConfig(response.data);
    } catch (error) {
      console.error("Failed to fetch configuration:", error);
      // Fallback to default config on error
      setConfig({
        snapshot_frequency: "daily",
        data_retention_days: 365,
        enabled_metrics: [],
        auto_snapshot_enabled: true,
        trend_threshold: 0.15,
        concentration_threshold: 0.4,
        spike_threshold: 2.0,
        backlog_threshold: 5,
        status_bottleneck_threshold: 0.3,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (config.id) {
        await api.patch(`plugins/analytics/configuration/${config.id}/`, config);
      } else {
        await api.post("plugins/analytics/configuration/", config);
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save configuration:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-[500px]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Analytics Configuration</DialogTitle>
          <DialogDescription>
            Manage snapshot frequency, data retention, and metric collection settings.
          </DialogDescription>
        </DialogHeader>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="snapshot_frequency">Snapshot Frequency</Label>
                <Select
                  value={config.snapshot_frequency}
                  onValueChange={(value: "daily" | "weekly" | "monthly") =>
                    setConfig({ ...config, snapshot_frequency: value })
                  }
                >
                  <SelectTrigger id="snapshot_frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="data_retention_days">Data Retention (Days)</Label>
                <Input
                  id="data_retention_days"
                  type="number"
                  value={config.data_retention_days}
                  onChange={(e) =>
                    setConfig({ ...config, data_retention_days: parseInt(e.target.value) || 0 })
                  }
                  min={1}
                  max={3650}
                />
              </div>

              <div className="flex items-center justify-between space-x-2">
                <Label htmlFor="auto_snapshot_enabled" className="flex-1">
                  Auto-generate Snapshots
                </Label>
                <Switch
                  id="auto_snapshot_enabled"
                  checked={config.auto_snapshot_enabled}
                  onCheckedChange={(checked) =>
                    setConfig({ ...config, auto_snapshot_enabled: checked })
                  }
                />
              </div>

              <div className="space-y-3 border-t pt-4">
                <div className="text-sm font-semibold">Insight Thresholds</div>
                <p className="text-xs text-muted-foreground">
                  Tune the sensitivity of automated insights. Changes apply to new insight
                  generation.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="trend_threshold" className="text-xs">
                      Trend Change (%)
                    </Label>
                    <Input
                      id="trend_threshold"
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={Math.round(config.trend_threshold * 100)}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          trend_threshold: (parseFloat(e.target.value) || 0) / 100,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="concentration_threshold" className="text-xs">
                      Concentration Share (%)
                    </Label>
                    <Input
                      id="concentration_threshold"
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={Math.round(config.concentration_threshold * 100)}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          concentration_threshold: (parseFloat(e.target.value) || 0) / 100,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="spike_threshold" className="text-xs">
                      Spike Multiplier (x avg)
                    </Label>
                    <Input
                      id="spike_threshold"
                      type="number"
                      step="0.1"
                      min="1"
                      value={config.spike_threshold}
                      onChange={(e) =>
                        setConfig({ ...config, spike_threshold: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="backlog_threshold" className="text-xs">
                      Backlog (min pending)
                    </Label>
                    <Input
                      id="backlog_threshold"
                      type="number"
                      step="1"
                      min="1"
                      value={config.backlog_threshold}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          backlog_threshold: parseInt(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label htmlFor="status_bottleneck_threshold" className="text-xs">
                      Status Bottleneck (% pending)
                    </Label>
                    <Input
                      id="status_bottleneck_threshold"
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={Math.round(config.status_bottleneck_threshold * 100)}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          status_bottleneck_threshold: (parseFloat(e.target.value) || 0) / 100,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
