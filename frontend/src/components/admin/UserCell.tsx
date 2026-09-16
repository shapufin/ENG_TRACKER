import React from "react";

interface UserCellProps {
  name?: string | null;
  /** Tech + held level labels, e.g. ["Infrastructure L3"]. Rendered under the
   * name so approvers can see the submitter's grade without leaving the queue. */
  techLevels?: string[];
}

export const UserCell: React.FC<UserCellProps> = ({ name, techLevels }) => {
  const initials =
    name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "?";

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium">
        {initials}
      </div>
      <div className="min-w-0">
        <span className="block truncate">{name || "Unknown"}</span>
        {(techLevels?.length ?? 0) > 0 && (
          <span
            className="block truncate text-micro text-muted-foreground"
            title={techLevels!.join(" · ")}
          >
            {techLevels!.join(" · ")}
          </span>
        )}
      </div>
    </div>
  );
};
