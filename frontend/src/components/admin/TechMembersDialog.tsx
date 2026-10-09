/**
 * Two-panel dialog for managing Tech members from the TechsPage.
 *
 * Left panel: current Tech members with remove buttons.
 * Right panel: server-side searchable list of users NOT in the tech,
 * with add buttons. Uses DRF search param for scalability (no client-side
 * limit on total user count).
 */
import React, { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, UserMinus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/SearchField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { userService } from "@/services/userService";
import type { Tech, TechMember } from "@/types";
import { toast } from "sonner";

const NO_LEVEL = "none";

interface TechMembersDialogProps {
  tech: Tech | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TechMembersDialog: React.FC<TechMembersDialogProps> = ({
  tech,
  open,
  onOpenChange,
}) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input (300ms) to avoid hammering the API on each keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Current members of this tech
  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ["admin", "techs", tech?.id, "members"],
    queryFn: () => userService.getTechMembers(tech!.id),
    enabled: !!tech && open,
  });

  // Server-side search for candidate users.
  // Uses DRF SearchFilter (username, email, first_name, last_name).
  // Fetches a page of 50 results — enough for interactive add, with
  // server-side filtering so no user is invisible due to client-side limits.
  const {
    data: candidatesData,
    isLoading: candidatesLoading,
    isError: candidatesError,
  } = useQuery({
    queryKey: ["admin", "techs", "candidates", debouncedSearch],
    queryFn: () =>
      userService.getUsers(
        debouncedSearch ? { search: debouncedSearch, page_size: 50 } : { page_size: 50 }
      ),
    enabled: open,
  });

  const members = useMemo(() => membersData?.results ?? [], [membersData]);
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  // Filter out existing members from candidates (client-side post-filter
  // on the server-searched page).
  const candidates = useMemo(() => {
    const all = candidatesData?.results ?? [];
    return all.filter((u) => !memberIds.has(u.id));
  }, [candidatesData, memberIds]);

  const addMutation = useMutation({
    mutationFn: ({ userIds, level }: { userIds: number[]; level?: number | null }) =>
      userService.addTechMembers(tech!.id, userIds, level),
    onSuccess: (data) => {
      toast.success(
        data.added > 0
          ? `Added ${data.added} user(s)`
          : data.regraded > 0
            ? `Updated level for ${data.regraded} user(s)`
            : "User already a member"
      );
      queryClient.invalidateQueries({ queryKey: ["admin", "techs", tech!.id, "members"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
    },
    onError: () => toast.error("Failed to add user(s)"),
  });

  const removeMutation = useMutation({
    mutationFn: (userIds: number[]) => userService.removeTechMembers(tech!.id, userIds),
    onSuccess: (data) => {
      toast.success(data.removed > 0 ? `Removed ${data.removed} user(s)` : "User not a member");
      queryClient.invalidateQueries({ queryKey: ["admin", "techs", tech!.id, "members"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
    },
    onError: () => toast.error("Failed to remove user(s)"),
  });

  // Adding without a level leaves the grade unset; the level dropdown on each
  // member row is what grades (or re-grades) them afterwards.
  const handleAdd = (userId: number) => addMutation.mutate({ userIds: [userId] });
  const handleRemove = (userId: number) => removeMutation.mutate([userId]);
  const handleSetLevel = (userId: number, level: number | null) =>
    addMutation.mutate({ userIds: [userId], level });

  const activeLevels = (tech?.levels ?? []).filter((level) => level.is_active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            Manage Members
            {tech && (
              <Badge variant="outline" className="text-xs">
                {tech.name}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Add or remove users from this Tech. Users can belong to multiple Techs.
          </DialogDescription>
        </DialogHeader>

        {/* Each panel scrolls independently (max-h-[min(...,50vh)] below) — the
            wrapper itself must not also scroll, or it double-scrolls. */}
        <div className="grid min-h-0 flex-1 gap-4 px-1 py-1 md:grid-cols-2">
          {/* Left panel: current members */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Members ({members.length})</h4>
            </div>
            <div className="no-scrollbar border-border max-h-[min(400px,50vh)] space-y-1 overflow-y-auto rounded-md border p-2">
              {membersLoading ? (
                <p className="text-muted-foreground p-4 text-center text-xs">Loading...</p>
              ) : members.length === 0 ? (
                <p className="text-muted-foreground p-4 text-center text-xs">No members yet.</p>
              ) : (
                members.map((m: TechMember) => (
                  <div
                    key={m.id}
                    className="hover:bg-muted/50 flex items-center justify-between rounded px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" title={m.full_name}>
                        {m.full_name}
                      </p>
                      <p
                        className="text-muted-foreground truncate text-xs"
                        title={`@${m.username}`}
                      >
                        @{m.username}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center">
                      {activeLevels.length > 0 && (
                        <Select
                          value={m.level?.id ? String(m.level.id) : NO_LEVEL}
                          onValueChange={(v) =>
                            handleSetLevel(m.id, v === NO_LEVEL ? null : Number(v))
                          }
                          disabled={addMutation.isPending}
                        >
                          <SelectTrigger
                            controlSize="sm"
                            className="mr-2 w-36 text-xs"
                            aria-label={`Level for ${m.username} in ${tech?.name}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_LEVEL}>No level</SelectItem>
                            {activeLevels.map((level) => (
                              <SelectItem key={level.id} value={String(level.id)}>
                                {level.name}
                              </SelectItem>
                            ))}
                            {m.level?.id && !activeLevels.some((l) => l.id === m.level?.id) && (
                              <SelectItem value={String(m.level.id)}>
                                {m.level.name} (inactive)
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
                        onClick={() => handleRemove(m.id)}
                        disabled={removeMutation.isPending}
                        aria-label={`Remove ${m.username} from ${tech?.name}`}
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right panel: candidates to add (server-side search) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Add Users</h4>
            </div>
            <SearchField
              placeholder="Search by name, username, email..."
              aria-label="Search users to add"
              value={search}
              onChange={setSearch}
            />
            <div className="no-scrollbar border-border max-h-[min(360px,50vh)] space-y-1 overflow-y-auto rounded-md border p-2">
              {candidatesLoading ? (
                <div className="text-muted-foreground flex items-center justify-center gap-2 p-4 text-xs">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching...
                </div>
              ) : candidatesError ? (
                <p className="text-destructive p-4 text-center text-xs">
                  Failed to load users. Try again.
                </p>
              ) : candidates.length === 0 ? (
                <p className="text-muted-foreground p-4 text-center text-xs">
                  {debouncedSearch ? "No matching users." : "No users available to add."}
                </p>
              ) : (
                candidates.map((u) => (
                  <div
                    key={u.id}
                    className="hover:bg-muted/50 flex items-center justify-between rounded px-2 py-1.5"
                  >
                    <div className="min-w-0">
                      <p
                        className="truncate text-sm font-medium"
                        title={
                          u.first_name || u.last_name
                            ? `${u.first_name} ${u.last_name}`.trim()
                            : u.username
                        }
                      >
                        {u.first_name || u.last_name
                          ? `${u.first_name} ${u.last_name}`.trim()
                          : u.username}
                      </p>
                      <p
                        className="text-muted-foreground truncate text-xs"
                        title={`@${u.username}`}
                      >
                        @{u.username}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-tone-success-text hover:bg-tone-success-surface h-7 w-7 p-0"
                      onClick={() => handleAdd(u.id)}
                      disabled={addMutation.isPending}
                      aria-label={`Add ${u.username} to ${tech?.name}`}
                    >
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
            {candidatesData && candidatesData.count > 50 && !debouncedSearch && (
              <p className="text-muted-foreground text-xs">
                Showing first 50 of {candidatesData.count} users. Use search to find others.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
