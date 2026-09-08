import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PasswordStrategy } from "../types/dataImport";

interface ImportOptionsPanelProps {
  targetKey: string | null;
  detectedColumns: string[];
  passwordColumn: string | null;
  onPasswordColumnChange: (column: string | null) => void;
  options: {
    update_existing?: boolean;
    match_by_email?: boolean;
    password_strategy?: PasswordStrategy;
    default_password?: string;
    overwrite_existing_password?: boolean;
  };
  onChange: <K extends keyof ImportOptionsPanelProps["options"]>(
    key: K,
    value: ImportOptionsPanelProps["options"][K]
  ) => void;
}

export const ImportOptionsPanel: React.FC<ImportOptionsPanelProps> = ({
  targetKey,
  detectedColumns,
  passwordColumn,
  onPasswordColumnChange,
  options,
  onChange,
}) => {
  const isUsers = targetKey === "users";

  return (
    <GlassCard isHoverLift={false}>
      <CardHeader>
        <CardTitle>Import Options</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="update-existing">Update existing records</Label>
            <p className="text-xs text-muted-foreground">
              Update matched records instead of skipping them.
            </p>
          </div>
          <Switch
            id="update-existing"
            checked={!!options.update_existing}
            onCheckedChange={(v) => onChange("update_existing", v)}
          />
        </div>

        {isUsers && (
          <>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="match-by-email">Match by email if username not found</Label>
                <p className="text-xs text-muted-foreground">
                  Useful when the export has different usernames.
                </p>
              </div>
              <Switch
                id="match-by-email"
                checked={!!options.match_by_email}
                onCheckedChange={(v) => onChange("match_by_email", v)}
              />
            </div>

            <div className="space-y-4 rounded-lg border p-4">
              <div className="space-y-2">
                <Label htmlFor="password-strategy">Password Strategy</Label>
                <Select
                  value={options.password_strategy ?? "generate"}
                  onValueChange={(v) => onChange("password_strategy", v as PasswordStrategy)}
                >
                  <SelectTrigger id="password-strategy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="generate">Generate a random password per user</SelectItem>
                    <SelectItem value="fixed">
                      Use a fixed default password for all users
                    </SelectItem>
                    <SelectItem value="column">Use the mapped Password column</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {options.password_strategy === "fixed" && (
                <div className="space-y-2">
                  <Label htmlFor="default-password">Default Password</Label>
                  <Input
                    id="default-password"
                    type="password"
                    value={options.default_password ?? ""}
                    onChange={(e) => onChange("default_password", e.target.value)}
                    placeholder="Enter default password for all new users"
                  />
                </div>
              )}

              {options.password_strategy === "column" && (
                <div className="space-y-2">
                  <Label htmlFor="password-column">Password Column</Label>
                  <Select
                    value={passwordColumn ?? "__skip__"}
                    onValueChange={(value) =>
                      onPasswordColumnChange(value === "__skip__" ? null : value)
                    }
                  >
                    <SelectTrigger id="password-column">
                      <SelectValue placeholder="Select the password column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__skip__">— Select a column —</SelectItem>
                      {detectedColumns.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="overwrite-password">Overwrite existing passwords</Label>
                  <p className="text-xs text-muted-foreground">
                    Change existing users' passwords when updating.
                  </p>
                </div>
                <Switch
                  id="overwrite-password"
                  checked={!!options.overwrite_existing_password}
                  onCheckedChange={(v) => onChange("overwrite_existing_password", v)}
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </GlassCard>
  );
};
