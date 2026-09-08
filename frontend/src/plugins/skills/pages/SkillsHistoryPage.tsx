/** Audit history page for skill rating changes, with skill + user filters. */
import React, { useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { ErrorCard } from "@/components/ui/ErrorCard";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Search, X, User as UserIcon } from "lucide-react";
import { useHistory, useSkills, useUsersSearch } from "../hooks/useSkillsQueries";
import { ProficiencyBadge } from "../components/ProficiencyBadge";

export const SkillsHistoryPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [skillId, setSkillId] = useState<number | undefined>(undefined);
  const [userId, setUserId] = useState<number | undefined>(undefined);
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const {
    data,
    isLoading,
    error: historyError,
    refetch: refetchHistory,
  } = useHistory(userId, skillId, page, dateFrom || undefined, dateTo || undefined);
  const { data: skills = [] } = useSkills({ active: true });
  const { data: userResults, isFetching: usersFetching } = useUsersSearch(
    userQuery,
    userSearchOpen
  );

  const entries = data?.results ?? [];
  const totalPages = data?.count ? Math.ceil(data.count / 20) : 1;

  const userCandidates = useMemo(() => userResults?.results ?? [], [userResults]);

  const handleSkillChange = (value: string) => {
    setSkillId(value === "all" ? undefined : Number(value));
    setPage(1);
  };

  const handleUserSelect = (id: number, username: string) => {
    setUserId(id);
    setSelectedUsername(username);
    setUserSearchOpen(false);
    setUserQuery("");
    setPage(1);
  };

  const handleClearUser = () => {
    setUserId(undefined);
    setSelectedUsername(null);
    setUserQuery("");
    setPage(1);
  };

  const handleClearFilters = () => {
    setSkillId(undefined);
    setDateFrom("");
    setDateTo("");
    handleClearUser();
  };

  const hasFilters = skillId !== undefined || userId !== undefined || !!dateFrom || !!dateTo;

  return (
    <PageShell title="Skill History" subtitle="Audit log of all rating changes" category="Skills">
      {/* Filters */}
      <GlassCard
        isHoverLift={false}
        className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="flex-1">
          <Label htmlFor="history-skill-filter">Skill</Label>
          <Select
            value={skillId !== undefined ? String(skillId) : "all"}
            onValueChange={handleSkillChange}
          >
            <SelectTrigger id="history-skill-filter" className="mt-1 w-full sm:w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All skills</SelectItem>
              {skills.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <Label htmlFor="history-user-filter">User</Label>
          <div className="mt-1 flex items-center gap-2">
            <Popover open={userSearchOpen} onOpenChange={setUserSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="history-user-filter"
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full justify-start font-normal sm:w-[200px]"
                >
                  <UserIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {selectedUsername ? (
                    <span className="truncate" title={selectedUsername}>
                      {selectedUsername}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">All users</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Search by username or email..."
                    className="pl-8"
                  />
                </div>
                <div className="mt-2 max-h-60 overflow-y-auto">
                  {userQuery.length < 2 ? (
                    <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                      Type at least 2 characters to search.
                    </div>
                  ) : usersFetching ? (
                    <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                      Searching...
                    </div>
                  ) : userCandidates.length === 0 ? (
                    <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                      No users found. User search may be limited based on your role.
                    </div>
                  ) : (
                    userCandidates.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleUserSelect(u.id, u.username)}
                        className="flex min-h-11 w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <span className="truncate font-medium">{u.username}</span>
                        {u.email && (
                          <span className="ml-2 truncate text-xs text-muted-foreground">
                            {u.email}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
            {userId !== undefined && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                onClick={handleClearUser}
                aria-label="Clear user filter"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="flex-1">
          <Label htmlFor="history-date-from">From</Label>
          <Input
            id="history-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="mt-1 min-h-11 w-full sm:w-[160px]"
          />
        </div>
        <div className="flex-1">
          <Label htmlFor="history-date-to">To</Label>
          <Input
            id="history-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="mt-1 min-h-11 w-full sm:w-[160px]"
          />
        </div>
        <span className="text-sm text-muted-foreground" role="status">
          {data?.count ?? 0} {(data?.count ?? 0) === 1 ? "result" : "results"}
        </span>
        {hasFilters && (
          <Button type="button" variant="ghost" className="min-h-11" onClick={handleClearFilters}>
            <X className="mr-2 h-4 w-4" aria-hidden="true" /> Clear filters
          </Button>
        )}
      </GlassCard>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {!isLoading && historyError && !data && (
        <ErrorCard
          title="Failed to load skill history"
          message="Could not fetch skill history. Please check your connection and try again."
          onRetry={() => void refetchHistory()}
        />
      )}
      {!isLoading && !historyError && entries.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No history yet.</p>
        </div>
      )}
      {!isLoading && entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-center gap-2">
                {entry.old_level !== null && <ProficiencyBadge level={entry.old_level} size="sm" />}
                {entry.old_level === null && entry.new_level !== null && (
                  <span className="text-sm text-muted-foreground">Created</span>
                )}
                <span className="text-muted-foreground">→</span>
                {entry.new_level !== null && <ProficiencyBadge level={entry.new_level} size="sm" />}
                {entry.new_level === null && (
                  <span className="text-sm text-muted-foreground">Removed</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{entry.skill_name ?? "Unknown skill"}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.username ?? "Unknown user"} · by {entry.changed_by_name ?? "system"} ·{" "}
                  {entry.source}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(entry.changed_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </PageShell>
  );
};
