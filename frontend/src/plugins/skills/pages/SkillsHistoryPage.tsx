/** Audit history page for skill rating changes, with skill + user filters. */
import React, { useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { SearchField } from "@/components/ui/SearchField";
import { Label } from "@/components/ui/label";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, X, User as UserIcon } from "lucide-react";
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
      <GlassCard className="mb-4 flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-end">
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
                  <UserIcon className="text-muted-foreground mr-2 h-4 w-4" />
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
                <SearchField
                  autoFocus
                  value={userQuery}
                  onChange={setUserQuery}
                  placeholder="Search by username or email..."
                  aria-label="Search users"
                />
                <div className="mt-2 max-h-60 overflow-y-auto">
                  {userQuery.length < 2 ? (
                    <div className="text-muted-foreground px-2 py-4 text-center text-xs">
                      Type at least 2 characters to search.
                    </div>
                  ) : usersFetching ? (
                    <div className="text-muted-foreground px-2 py-4 text-center text-xs">
                      Searching...
                    </div>
                  ) : userCandidates.length === 0 ? (
                    <div className="text-muted-foreground px-2 py-4 text-center text-xs">
                      No users found. User search may be limited based on your role.
                    </div>
                  ) : (
                    userCandidates.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleUserSelect(u.id, u.username)}
                        className="hover:bg-muted flex min-h-11 w-full items-center rounded px-2 py-1.5 text-left text-sm"
                      >
                        <span className="truncate font-medium">{u.username}</span>
                        {u.email && (
                          <span className="text-muted-foreground ml-2 truncate text-xs">
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
          <Label htmlFor="history-date-range">Date range</Label>
          <DateRangePicker
            id="history-date-range"
            from={dateFrom}
            to={dateTo}
            onChange={({ from, to }) => {
              setDateFrom(from);
              setDateTo(to);
              setPage(1);
            }}
            placeholder="Filter by date"
            className="mt-1 min-h-11 w-full sm:w-[220px]"
          />
        </div>
        <span className="text-muted-foreground text-sm" role="status">
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
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
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
        <div className="border-border rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground text-sm">No history yet.</p>
        </div>
      )}
      {!isLoading && entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="border-border bg-card flex flex-wrap items-center gap-3 rounded-lg border p-3"
            >
              <div className="flex items-center gap-2">
                {entry.old_level !== null && <ProficiencyBadge level={entry.old_level} size="sm" />}
                {entry.old_level === null && entry.new_level !== null && (
                  <span className="text-muted-foreground text-sm">Created</span>
                )}
                <span className="text-muted-foreground">→</span>
                {entry.new_level !== null && <ProficiencyBadge level={entry.new_level} size="sm" />}
                {entry.new_level === null && (
                  <span className="text-muted-foreground text-sm">Removed</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{entry.skill_name ?? "Unknown skill"}</p>
                <p className="text-muted-foreground text-xs">
                  {entry.username ?? "Unknown user"} · by {entry.changed_by_name ?? "system"} ·{" "}
                  {entry.source}
                </p>
              </div>
              <span className="text-muted-foreground shrink-0 text-xs">
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
          <span className="text-muted-foreground text-sm">
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
