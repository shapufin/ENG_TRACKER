import React from "react";
import { Lock } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export const NoAccess: React.FC = () => (
  <EmptyState
    icon={Lock}
    title="You do not have access to this"
    description="Ask an administrator to grant you the HBPR role."
    className="py-8"
  />
);
