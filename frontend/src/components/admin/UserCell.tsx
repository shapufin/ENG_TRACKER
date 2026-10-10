import React from "react";

interface UserCellProps {
  name?: string | null;
  /** Tech + held level labels, e.g. ["Infrastructure L3"]. Rendered under the
   * name so approvers can see the submitter's grade without leaving the queue. */
  techLevels?: string[];
  /** Second line under the name, e.g. the email address. */
  subtitle?: string | null;
}

export const UserCell: React.FC<UserCellProps> = ({ name, techLevels, subtitle }) => {
  const initials =
    name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "?";

  return (
    <div className="flex items-center gap-2">
      <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium">
        {initials}
      </div>
      <div className="min-w-0">
        <span className="block truncate">{name || "Unknown"}</span>
        {subtitle && (
          <span className="text-muted-foreground block truncate text-xs" title={subtitle}>
            {subtitle}
          </span>
        )}
        {(techLevels?.length ?? 0) > 0 && (
          <span
            className="text-xs text-muted-foreground block truncate"
            title={techLevels!.join(" · ")}
          >
            {techLevels!.join(" · ")}
          </span>
        )}
      </div>
    </div>
  );
};
