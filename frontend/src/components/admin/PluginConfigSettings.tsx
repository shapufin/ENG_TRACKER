import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PluginConfigSettingsProps } from "./pluginConfigTypes";

export const PluginConfigSettings: React.FC<PluginConfigSettingsProps> = ({
  details,
  config,
  onConfigChange,
}) => {
  const hasConfig =
    Object.keys(config).length > 0 ||
    (details?.config_schema && Object.keys(details.config_schema).length > 0);

  return (
    <div className="space-y-6 pt-4">
      {details?.description && (
        <div className="rounded-lg bg-muted p-4">
          <p className="text-sm text-muted-foreground">{details.description}</p>
        </div>
      )}

      {!hasConfig ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">This plugin has no configurable settings.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(config).map(([key, value]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key} className="capitalize">
                {key.replace(/_/g, " ")}
              </Label>
              <Input
                id={key}
                value={typeof value === "string" ? value : JSON.stringify(value)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    onConfigChange(key, parsed);
                  } catch {
                    onConfigChange(key, e.target.value);
                  }
                }}
                placeholder={`Enter ${key}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
