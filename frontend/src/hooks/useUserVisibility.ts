import { useState, useCallback, useEffect, useRef } from "react";
import { toggleSetItem } from "@/lib/set-utils";
import type { User } from "@/types";

const SIDEBAR_COLLAPSE_KEY = "calendar_sidebar_collapsed";

interface UseUserVisibilityOptions {
  allUsers: User[];
}

interface UseUserVisibilityReturn {
  visibleUsers: Set<number>;
  displayedUsers: User[];
  showAllMembers: boolean;
  setShowAllMembers: (show: boolean) => void;
  isSidebarCollapsed: boolean;
  handleSidebarToggle: () => void;
  toggleUser: (id: number) => void;
  handleResetVisibleUsers: () => void;
}

export const useUserVisibility = ({
  allUsers,
}: UseUserVisibilityOptions): UseUserVisibilityReturn => {
  const [visibleUsers, setVisibleUsers] = useState<Set<number>>(new Set());
  const [showAllMembers, setShowAllMembers] = useState(false);
  const visibleUsersSignature = useRef<string>("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "true";
  });

  // Initialize visible users when allUsers changes
  useEffect(() => {
    const ids = allUsers.map((u: User) => u.id);
    const signature = ids.join("|");
    // Always reset to show all users when the user list changes (new workspace)
    if (signature !== visibleUsersSignature.current) {
      visibleUsersSignature.current = signature;
      setVisibleUsers(new Set(ids));
    }
  }, [allUsers]);

  // Persist sidebar collapse state
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(SIDEBAR_COLLAPSE_KEY, isSidebarCollapsed ? "true" : "false");
  }, [isSidebarCollapsed]);

  const handleSidebarToggle = useCallback(() => setIsSidebarCollapsed((prev) => !prev), []);

  const toggleUser = useCallback((id: number) => {
    setVisibleUsers((prev) => toggleSetItem(prev, id));
  }, []);

  const handleResetVisibleUsers = useCallback(() => {
    setVisibleUsers(new Set(allUsers.map((user) => user.id)));
  }, [allUsers]);

  const displayedUsers = showAllMembers ? allUsers : allUsers.slice(0, 6);

  return {
    visibleUsers,
    displayedUsers,
    showAllMembers,
    setShowAllMembers,
    isSidebarCollapsed,
    handleSidebarToggle,
    toggleUser,
    handleResetVisibleUsers,
  };
};
