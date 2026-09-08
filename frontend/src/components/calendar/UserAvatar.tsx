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
  xs: "h-6 w-6 text-[10px]",
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
};

const palette = [
  "bg-blue-500/20 text-blue-500",
  "bg-emerald-500/20 text-emerald-600",
  "bg-primary/20 text-primary",
  "bg-amber-500/20 text-amber-600",
  "bg-rose-500/20 text-rose-500",
  "bg-cyan-500/20 text-cyan-600",
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
        "flex items-center justify-center rounded-full font-semibold uppercase shadow-sm ring-1 ring-border/30",
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
