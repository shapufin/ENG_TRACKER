import React from "react";
import { Search } from "lucide-react";
import { HeaderProfileMenu } from "./HeaderProfileMenu";

interface MobileHeaderActionsProps {
  user: React.ComponentProps<typeof HeaderProfileMenu>["user"];
  roleSubtitle?: string;
  onOpenSearch: () => void;
  onLogout: () => void;
}

/** Phone header actions: page launcher (command palette) and the account menu. */
export const MobileHeaderActions: React.FC<MobileHeaderActionsProps> = ({
  user,
  roleSubtitle,
  onOpenSearch,
  onLogout,
}) => (
  <>
    <button
      type="button"
      onClick={onOpenSearch}
      aria-label="Search pages"
      className="hover:bg-accent flex h-11 w-11 items-center justify-center rounded-md"
    >
      <Search className="h-5 w-5" />
    </button>
    <HeaderProfileMenu user={user} roleSubtitle={roleSubtitle} onLogout={onLogout} />
  </>
);
