import React from "react";

interface UserCellProps {
  name?: string | null;
}

export const UserCell: React.FC<UserCellProps> = ({ name }) => {
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
      <span>{name || "Unknown"}</span>
    </div>
  );
};
