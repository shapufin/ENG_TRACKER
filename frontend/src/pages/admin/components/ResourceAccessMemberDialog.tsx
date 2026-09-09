import { useEffect, useRef, useState } from "react";
import { Loader2, Search, UserPlus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMemberCandidates } from "../hooks/useMemberCandidates";
import type { MemberCandidate } from "@/types";

export interface ResourceAccessMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: number;
  groupName: string;
  onAdd: (userId: number) => void;
  isPending: boolean;
  errorMessage?: string | null;
}

export function ResourceAccessMemberDialog({
  open,
  onOpenChange,
  groupId,
  groupName,
  onAdd,
  isPending,
  errorMessage,
}: ResourceAccessMemberDialogProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MemberCandidate | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (open) {
      setSearch("");
      setSelected(null);
      const timer = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  // Debounce the raw input so a single network request fires after the user
  // stops typing, not one per keystroke. The input stays responsive because it
  // binds to `search`; only the query waits on `debouncedSearch`.
  const debouncedSearch = useDebouncedValue(search, 250);

  const candidates = useMemberCandidates({
    groupId,
    search: debouncedSearch,
    page: 1,
    pageSize: 10,
    enabled: open,
  });

  const candidateList = candidates.data?.results ?? [];
  const canSubmit = selected !== null && !isPending;
  // True while the user is typing but the debounced query hasn't fired yet,
  // so we show a pending state instead of a premature "No users found".
  const isPendingSearch = search !== debouncedSearch;
  const isSearching = isPendingSearch || candidates.isLoading;

  const handleSubmit = () => {
    if (!canSubmit || !selected) return;
    onAdd(selected.id);
  };

  const handleClose = (open: boolean) => {
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="sm">
        <DialogHeader className="shrink-0">
          <DialogTitle>Add member to {groupName}</DialogTitle>
          <DialogDescription>Search users and add one to this group.</DialogDescription>
        </DialogHeader>
        <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-1">
          {/* Search input */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              type="search"
              placeholder="Search by name, username, or email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelected(null);
              }}
              className="pl-9"
              aria-label="Search users"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                onClick={() => {
                  setSearch("");
                  setSelected(null);
                }}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Selected user */}
          {selected && (
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-medium"
                  title={selected.full_name || selected.username}
                >
                  {selected.full_name || selected.username}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={selected.email}>
                  {selected.email}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setSelected(null)}
                aria-label="Deselect user"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Results */}
          {!selected && search.length > 0 && (
            <div
              className="no-scrollbar max-h-64 space-y-1 overflow-y-auto"
              role="listbox"
              aria-label="User results"
            >
              {isSearching && (
                <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </div>
              )}
              {!isSearching && candidateList.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No users found. Try a different search.
                </div>
              )}
              {!isSearching &&
                candidateList.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/40 focus:bg-muted/40 focus:outline-none"
                    onClick={() => setSelected(candidate)}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                      {(candidate.full_name || candidate.username).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-medium"
                        title={candidate.full_name || candidate.username}
                      >
                        {candidate.full_name || candidate.username}
                      </p>
                      <p
                        className="truncate text-xs text-muted-foreground"
                        title={candidate.email || candidate.username}
                      >
                        {candidate.email || candidate.username}
                      </p>
                    </div>
                  </button>
                ))}
            </div>
          )}

          {/* Hint when no search */}
          {!selected && search.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Start typing to search for users to add.
            </p>
          )}

          {errorMessage && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
        </div>
        <DialogFooter className="shrink-0 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={handleSubmit}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 h-4 w-4" />
            )}
            Add member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
