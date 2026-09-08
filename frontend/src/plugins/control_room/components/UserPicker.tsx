/**
 * UserPicker — searchable combobox for selecting an existing Django user to
 * grant Control Room access to.
 *
 * Queries /users/users/?search= and excludes users who already have a
 * ControlRoomAccess record (passed in via `excludeUserIds`). Uses the
 * existing Popover + Input primitives (theme-aware).
 */
import React, { useMemo, useState } from "react";
import { Search, X, User as UserIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { userService } from "@/services/userService";
import type { ControlRoomEligibleUser } from "@/services/userService";

interface UserPickerProps {
  value: number | null;
  onChange: (userId: number | null, user?: ControlRoomEligibleUser) => void;
  excludeUserIds?: number[];
  placeholder?: string;
  disabled?: boolean;
}

export const UserPicker: React.FC<UserPickerProps> = ({
  value,
  onChange,
  excludeUserIds = [],
  placeholder = "Search by username or email...",
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { data: searchResults, isFetching } = useQuery({
    queryKey: ["users", "search", query],
    queryFn: () => userService.getEligibleControlRoomUsers({ search: query, page_size: 20 }),
    enabled: open && query.length >= 2,
    staleTime: 15_000,
  });

  // Stabilize the array reference so downstream memos don't recompute on
  // every render. `searchResults?.results ?? []` would create a new array
  // each render when results are undefined.
  const searchUsers = useMemo(() => searchResults?.results ?? [], [searchResults]);

  const excludeSet = useMemo(() => new Set(excludeUserIds), [excludeUserIds]);
  const candidates = useMemo(
    () => searchUsers.filter((u) => !excludeSet.has(u.id)).slice(0, 20),
    [searchUsers, excludeSet]
  );

  const selectedUser = useMemo(
    () => (value ? searchUsers.find((u) => u.id === value) : null),
    [value, searchUsers]
  );

  const handleClear = () => {
    onChange(null);
    setQuery("");
  };

  return (
    <div className="flex w-full items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start font-normal"
            disabled={disabled}
          >
            <UserIcon className="mr-2 h-4 w-4 text-muted-foreground" />
            {selectedUser ? (
              <span className="truncate">
                {selectedUser.username}{" "}
                <span className="text-muted-foreground">· {selectedUser.email}</span>
              </span>
            ) : value ? (
              <span className="text-muted-foreground">User #{value}</span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type at least 2 characters..."
              className="pl-8"
            />
          </div>
          <div className="mt-2 max-h-60 overflow-y-auto">
            {query.length < 2 ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                Start typing to search users.
              </div>
            ) : isFetching ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                Searching...
              </div>
            ) : candidates.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                No users found.
              </div>
            ) : (
              candidates.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    onChange(u.id, u);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                    value === u.id && "bg-muted"
                  )}
                >
                  <span className="truncate">
                    <span className="font-medium">{u.username}</span>{" "}
                    <span className="text-muted-foreground">· {u.email}</span>
                  </span>
                  {u.full_name && (
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                      {u.full_name}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
      {value && !disabled && (
        <Button type="button" variant="ghost" size="icon" onClick={handleClear}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};
