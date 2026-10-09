import { useEffect, useState } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/SearchField";
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

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (open) {
      setSearch("");
      setSelected(null);
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
          <SearchField
            autoFocus
            placeholder="Search by name, username, or email..."
            value={search}
            onChange={(v) => {
              setSearch(v);
              setSelected(null);
            }}
            aria-label="Search users"
          />

          {/* Selected user */}
          {selected && (
            <div className="border-border/60 bg-muted/20 flex items-center justify-between rounded-lg border px-3 py-2">
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-medium"
                  title={selected.full_name || selected.username}
                >
                  {selected.full_name || selected.username}
                </p>
                <p className="text-muted-foreground truncate text-xs" title={selected.email}>
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
                <div className="text-muted-foreground flex items-center justify-center py-6 text-sm">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </div>
              )}
              {!isSearching && candidateList.length === 0 && (
                <div className="text-muted-foreground py-6 text-center text-sm">
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
                    className="hover:bg-table-hover focus:bg-table-hover flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors focus:outline-hidden"
                    onClick={() => setSelected(candidate)}
                  >
                    <div className="bg-secondary text-secondary-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
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
                        className="text-muted-foreground truncate text-xs"
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
            <p className="text-muted-foreground py-4 text-center text-sm">
              Start typing to search for users to add.
            </p>
          )}

          {errorMessage && (
            <p className="text-destructive text-sm" role="alert">
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
