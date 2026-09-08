import React from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  isCollapsed?: boolean;
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ isCollapsed = false, className }) => {
  const { theme, setTheme, resolved } = useTheme();

  if (isCollapsed) {
    return (
      <div className={cn("flex justify-center", className)}>
        <button
          onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
          className="rounded-lg p-2 transition-colors hover:bg-accent"
          aria-label="Toggle theme"
          title={`Switch to ${resolved === "dark" ? "light" : "dark"} mode`}
        >
          {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-between", className)}>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Theme
      </span>
      <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5">
        <button
          onClick={() => setTheme("light")}
          className={cn(
            "rounded-md p-1.5 transition-all duration-200",
            theme === "light"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
          aria-label="Light mode"
          title="Light mode"
        >
          <Sun className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setTheme("dark")}
          className={cn(
            "rounded-md p-1.5 transition-all duration-200",
            theme === "dark"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
          aria-label="Dark mode"
          title="Dark mode"
        >
          <Moon className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setTheme("system")}
          className={cn(
            "rounded-md p-1.5 transition-all duration-200",
            theme === "system"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
          aria-label="System mode"
          title="System mode"
        >
          <Monitor className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
