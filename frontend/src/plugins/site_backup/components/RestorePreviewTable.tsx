import React, { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { TABLE_HEAD_ROW_CLASS } from "@/components/ui/tableStyles";
import type { RestoreModelGroup } from "../types/siteBackup";

interface RestorePreviewTableProps {
  modelGroups: RestoreModelGroup[];
  approvedModels: Set<string>;
  onToggleApprove: (model: string) => void;
  deleteMissingModels: Set<string>;
  onToggleDeleteMissing: (model: string) => void;
}

/** Every model transitively forced in by an approved model's FK dependents. */
const useForcedModels = (modelGroups: RestoreModelGroup[], approvedModels: Set<string>) =>
  useMemo(() => {
    const forced = new Set<string>();
    for (const group of modelGroups) {
      if (approvedModels.has(group.model)) {
        group.forced_dependents.forEach((dep) => {
          if (!approvedModels.has(dep)) forced.add(dep);
        });
      }
    }
    return forced;
  }, [modelGroups, approvedModels]);

export const RestorePreviewTable: React.FC<RestorePreviewTableProps> = ({
  modelGroups,
  approvedModels,
  onToggleApprove,
  deleteMissingModels,
  onToggleDeleteMissing,
}) => {
  const forcedModels = useForcedModels(modelGroups, approvedModels);

  if (modelGroups.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        This backup contains no rows to restore.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className={TABLE_HEAD_ROW_CLASS}>
            <th className="w-10 py-2 pr-2">
              <span className="sr-only">Restore</span>
            </th>
            <th className="py-2 pr-4">Model</th>
            <th className="py-2 pr-4 text-right">New</th>
            <th className="py-2 pr-4 text-right">Overwritten</th>
            <th className="py-2 pr-4 text-right">Not in backup</th>
            <th className="py-2 pr-2">Also delete missing</th>
          </tr>
        </thead>
        <tbody>
          {modelGroups.map((group) => {
            const isApproved = approvedModels.has(group.model);
            const isForced = !isApproved && forcedModels.has(group.model);
            const rowChecked = isApproved || isForced;
            const hasDependents = group.forced_dependents.length > 0;
            return (
              <tr key={group.model} className="border-line-subtle border-b last:border-0">
                <td className="py-2 pr-2 align-top">
                  <Checkbox
                    checked={rowChecked}
                    disabled={isForced}
                    aria-label={`Restore ${group.model}`}
                    onCheckedChange={() => onToggleApprove(group.model)}
                  />
                </td>
                <td className="py-2 pr-4 align-top">
                  <div className="font-mono text-xs">{group.model}</div>
                  {isForced && (
                    <span
                      className="text-muted-foreground mt-1 inline-block text-xs"
                      title={`Required because it references an approved model's rows.`}
                    >
                      Required by an approved model
                    </span>
                  )}
                  {hasDependents && (
                    <span
                      className="text-muted-foreground mt-1 block text-xs"
                      title={group.forced_dependents.join(", ")}
                    >
                      Forces {group.forced_dependents.length} dependent model
                      {group.forced_dependents.length === 1 ? "" : "s"} if approved
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right align-top tabular-nums">{group.new}</td>
                <td className="py-2 pr-4 text-right align-top tabular-nums">{group.overwritten}</td>
                <td className="py-2 pr-4 text-right align-top tabular-nums">{group.db_only}</td>
                <td className="py-2 pr-2 align-top">
                  {group.db_only > 0 ? (
                    <label className="flex items-center gap-2">
                      <Checkbox
                        checked={deleteMissingModels.has(group.model)}
                        disabled={!isApproved}
                        aria-label={`Also delete rows missing from the backup for ${group.model}`}
                        onCheckedChange={() => onToggleDeleteMissing(group.model)}
                      />
                      {deleteMissingModels.has(group.model) && (
                        <Badge variant="warning">Deletes {group.db_only}</Badge>
                      )}
                    </label>
                  ) : (
                    <span className="text-muted-foreground/60 font-mono text-xs tracking-wider uppercase">
                      n/a
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
