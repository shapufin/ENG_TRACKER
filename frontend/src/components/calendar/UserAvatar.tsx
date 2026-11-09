import React from "react";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  name?: string;
  email?: string;
  colorSeed?: number;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  tooltip?: string;
}

const sizeMap: Record<NonNullable<UserAvatarProps["size"]>, string> = {
  xs: "h-6 w-6 text-xs",
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
};

// Tone tokens carry the light/dark pair and clear 4.5:1 for their text on their surface.
const palette = [
  "bg-tone-info-surface text-tone-info-text",
  "bg-tone-success-surface text-tone-success-text",
  "bg-tone-accent-surface text-tone-accent-text",
  "bg-tone-warning-surface text-tone-warning-text",
  "bg-tone-danger-surface text-tone-danger-text",
  "bg-tone-neutral-surface text-tone-neutral-text",
];

const getInitials = (name?: string, email?: string) => {
  if (name?.trim()) {
    const [first = "", second = ""] = name.trim().split(" ");
    return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
  }
  if (email) {
    return email.charAt(0).toUpperCase();
  }
  return "?";
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  email,
  colorSeed = 0,
  size = "sm",
  className,
  onClick,
  tooltip,
}) => {
  const initials = getInitials(name, email);
  const colorClass = palette[colorSeed % palette.length];

  const content = (
    <div
      className={cn(
        "ring-border/30 flex items-center justify-center rounded-full font-semibold uppercase shadow-sm ring-1",
        sizeMap[size],
        colorClass,
        onClick && "cursor-pointer transition hover:scale-[1.02]",
        className
      )}
      title={tooltip || name || email}
      onClick={onClick}
    >
      {initials}
    </div>
  );

  return content;
};
