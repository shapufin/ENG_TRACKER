import React from "react";
import { Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PROFICIENCY_LEVELS } from "../utils/proficiencyLevels";
import { SkillsGapSummary } from "./SkillsGapSummary";
import type { SkillCategory, SkillCoverage } from "../types/skills";

interface SkillsTeamFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  categoryCode: string;
  onCategoryChange: (code: string) => void;
  minLevel: number | undefined;
  onMinLevelChange: (level: number | undefined) => void;
  maxLevel: number | undefined;
  onMaxLevelChange: (level: number | undefined) => void;
  onReset: () => void;
  categories: SkillCategory[];
  gaps: SkillCoverage[];
  isMobile: boolean;
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
}

const hasActiveFilters = (
  search: string,
  categoryCode: string,
  minLevel: number | undefined,
  maxLevel: number | undefined
) => !!search || categoryCode !== "all" || minLevel !== undefined || maxLevel !== undefined;

export const SkillsTeamFilters: React.FC<SkillsTeamFiltersProps> = ({
  search,
  onSearchChange,
  categoryCode,
  onCategoryChange,
  minLevel,
  onMinLevelChange,
  maxLevel,
  onMaxLevelChange,
  onReset,
  categories,
  gaps,
  isMobile,
  filtersOpen,
  onFiltersOpenChange,
}) => {
  const isActive = hasActiveFilters(search, categoryCode, minLevel, maxLevel);

  return (
    <>
      {/* Desktop filters */}
      <GlassCard isHoverLift={false} className="space-y-3 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Filters
          </h2>
          {isActive && (
            <Button type="button" variant="ghost" size="sm" onClick={onReset}>
              <Filter className="mr-2 h-4 w-4" aria-hidden="true" /> Reset filters
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.5fr)_repeat(3,minmax(140px,1fr))]">
          <div>
            <Label htmlFor="team-search">Search</Label>
            <div className="relative mt-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="team-search"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search members or skills..."
                className="w-full pl-9"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="team-category">Category</Label>
            <Select value={categoryCode} onValueChange={onCategoryChange}>
              <SelectTrigger id="team-category" className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.code} value={cat.code}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="team-min-level">Minimum level</Label>
            <Select
              value={minLevel === undefined ? "all" : String(minLevel)}
              onValueChange={(value) =>
                onMinLevelChange(value === "all" ? undefined : Number(value))
              }
            >
              <SelectTrigger id="team-min-level" className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any minimum</SelectItem>
                {PROFICIENCY_LEVELS.map((level) => (
                  <SelectItem key={level.level} value={String(level.level)}>
                    L{level.level}+
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="team-max-level">Maximum level</Label>
            <Select
              value={maxLevel === undefined ? "all" : String(maxLevel)}
              onValueChange={(value) =>
                onMaxLevelChange(value === "all" ? undefined : Number(value))
              }
            >
              <SelectTrigger id="team-max-level" className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any maximum</SelectItem>
                {PROFICIENCY_LEVELS.map((level) => (
                  <SelectItem key={level.level} value={String(level.level)}>
                    L{level.level}-
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {gaps.length > 0 && (
          <div className="border-t border-border/70 pt-3">
            <SkillsGapSummary gaps={gaps} />
          </div>
        )}
      </GlassCard>

      {isMobile && (
        <Dialog open={filtersOpen} onOpenChange={onFiltersOpenChange}>
          <DialogContent className="flex max-h-[90vh] max-w-[92vw] flex-col overflow-hidden">
            <DialogHeader className="shrink-0">
              <DialogTitle>Team filters</DialogTitle>
              <DialogDescription>Narrow the team view by proficiency level.</DialogDescription>
            </DialogHeader>
            <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto">
              <div>
                <Label htmlFor="team-mobile-min-level">Minimum level</Label>
                <Select
                  value={minLevel === undefined ? "all" : String(minLevel)}
                  onValueChange={(value) =>
                    onMinLevelChange(value === "all" ? undefined : Number(value))
                  }
                >
                  <SelectTrigger id="team-mobile-min-level" className="mt-1 min-h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any minimum</SelectItem>
                    {PROFICIENCY_LEVELS.map((level) => (
                      <SelectItem key={level.level} value={String(level.level)}>
                        L{level.level}+
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="team-mobile-max-level">Maximum level</Label>
                <Select
                  value={maxLevel === undefined ? "all" : String(maxLevel)}
                  onValueChange={(value) =>
                    onMaxLevelChange(value === "all" ? undefined : Number(value))
                  }
                >
                  <SelectTrigger id="team-mobile-max-level" className="mt-1 min-h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any maximum</SelectItem>
                    {PROFICIENCY_LEVELS.map((level) => (
                      <SelectItem key={level.level} value={String(level.level)}>
                        L{level.level}-
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" className="min-h-11 w-full" onClick={onReset}>
                Reset filters
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
