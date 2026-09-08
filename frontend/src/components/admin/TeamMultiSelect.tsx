/**
 * TeamMultiSelect — shared multi-select for assigning teams.
 *
 * Uses the existing Popover + Checkbox primitives (theme-aware). Teams are
 * passed in from the parent (typically from useUserManagement().teams or a
 * dedicated useTeams query) so the component stays reusable.
 *
 * Moved from plugins/control_room/components/ to components/admin/ so core
 * pages can use it without importing plugin code (plugin boundary rule).
 */
import React, { useMemo, useState } from "react";
import { ChevronsUpDown, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/** Minimal team shape needed by the multi-select (id, name, code).
 *  `parent_team` is optional — consumers passing partial objects
 *  (e.g. ControlRoomFilters builds {id, name, code} from coverage data)
 *  render as roots (flat, current behavior). */
interface TeamOption {
  id: number;
  name: string;
  code: string;
  parent_team?: number | null;
}

interface TeamMultiSelectProps {
  teams: TeamOption[];
  value: number[];
  onChange: (teamIds: number[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const TeamMultiSelect: React.FC<TeamMultiSelectProps> = ({
  teams,
  value,
  onChange,
  placeholder = "Select teams...",
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Build a parent→children map for hierarchy rendering.
  // Teams without parent_team (or with parent_team not in the list) are roots.
  // Self-references (parent_team === id) and cycles are treated as roots
  // to prevent infinite recursion / stack overflow in renderTeamNode.
  const { roots, childrenMap } = useMemo(() => {
    const ids = new Set(teams.map((t) => t.id));
    const map = new Map<number | null, TeamOption[]>();
    const rootList: TeamOption[] = [];
    // Detect whether a team's parent chain forms a cycle.
    const hasCycle = (startId: number): boolean => {
      const seen = new Set<number>();
      let cur: number | null | undefined = startId;
      while (cur != null && ids.has(cur)) {
        if (seen.has(cur)) return true; // cycle detected
        seen.add(cur);
        const node = teams.find((t) => t.id === cur);
        cur = node?.parent_team ?? null;
        if (cur === null) break;
      }
      return false;
    };
    for (const t of teams) {
      const pid = t.parent_team ?? null;
      // Skip self-reference, dangling parent, or cyclic parent chain → root.
      if (pid !== null && pid !== t.id && ids.has(pid) && !hasCycle(t.id)) {
        const arr = map.get(pid) ?? [];
        arr.push(t);
        map.set(pid, arr);
      } else {
        rootList.push(t);
      }
    }
    // Sort roots and children alphabetically for deterministic order.
    rootList.sort((a, b) => a.name.localeCompare(b.name));
    for (const arr of map.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return { roots: rootList, childrenMap: map };
  }, [teams]);

  // Flatten the tree for search filtering (keeps all teams searchable).
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return null; // null = use tree rendering
    return teams.filter(
      (t) => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)
    );
  }, [teams, query]);

  const selectedTeams = useMemo(() => teams.filter((t) => value.includes(t.id)), [teams, value]);

  const toggle = (id: number) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const handleClear = () => {
    onChange([]);
    setQuery("");
  };

  // Recursive render for hierarchy mode (no search active).
  // Pre-declared indentation classes so Tailwind JIT can detect them.
  const DEPTH_PADDING = ["pl-2", "pl-6", "pl-10", "pl-14", "pl-18", "pl-22"];

  const renderTeamNode = (team: TeamOption, depth: number): React.ReactNode => {
    // Depth guard: safety net against any residual cycle / runaway recursion.
    if (depth > 20) return null;
    const checked = value.includes(team.id);
    const children = childrenMap.get(team.id) ?? [];
    return (
      <React.Fragment key={team.id}>
        <div
          role="option"
          aria-selected={checked}
          aria-level={depth + 1}
          tabIndex={0}
          onClick={() => toggle(team.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle(team.id);
            }
          }}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            DEPTH_PADDING[Math.min(depth, DEPTH_PADDING.length - 1)],
            checked && "bg-primary/5"
          )}
        >
          <Checkbox checked={checked} className="pointer-events-none" />
          <span className="flex-1 truncate" title={team.name}>
            {team.name}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{team.code}</span>
        </div>
        {children.map((child) => renderTeamNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
            disabled={disabled}
          >
            <span
              className="truncate"
              title={
                selectedTeams.length === 1
                  ? `${selectedTeams[0].name} (${selectedTeams[0].code})`
                  : selectedTeams.length > 1
                    ? `${selectedTeams.length} teams selected`
                    : placeholder
              }
            >
              {selectedTeams.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : selectedTeams.length === 1 ? (
                `${selectedTeams[0].name} (${selectedTeams[0].code})`
              ) : (
                `${selectedTeams.length} teams selected`
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter teams..."
              className="pl-8"
            />
          </div>
          <div className="mt-2 max-h-60 overflow-y-auto overflow-x-hidden">
            {filtered === null ? (
              // Tree mode (no search) — render hierarchy with indentation.
              roots.length === 0 ? (
                <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                  No teams found.
                </div>
              ) : (
                roots.map((t) => renderTeamNode(t, 0))
              )
            ) : filtered.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                No teams found.
              </div>
            ) : (
              // Search mode — flat filtered list (all matching teams).
              filtered.map((t) => {
                const checked = value.includes(t.id);
                return (
                  <div
                    key={t.id}
                    role="option"
                    aria-selected={checked}
                    tabIndex={0}
                    onClick={() => toggle(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(t.id);
                      }
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      checked && "bg-primary/5"
                    )}
                  >
                    <Checkbox checked={checked} className="pointer-events-none" />
                    <span className="flex-1 truncate" title={t.name}>
                      {t.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{t.code}</span>
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selectedTeams.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedTeams.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs text-foreground"
            >
              {t.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  className="ml-0.5 text-foreground/60 hover:text-foreground"
                  aria-label={`Remove ${t.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
};
