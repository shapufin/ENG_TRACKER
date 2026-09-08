import React from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar, User } from "lucide-react";
import type { ConflictEntry } from "./ConflictsModal";

interface ConflictCardProps {
  conflict: ConflictEntry;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "approved":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/30";
    case "rejected":
      return "bg-rose-500/15 text-rose-800 dark:text-rose-400 border-rose-500/30";
    case "pending":
    default:
      return "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30";
  }
};

const getTypeColor = (type: string) => {
  switch (type) {
    case "vacation":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border-emerald-500/30";
    case "sick":
      return "bg-rose-500/15 text-rose-800 dark:text-rose-400 border-rose-500/30";
    default:
      return "bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30";
  }
};

export const ConflictCard: React.FC<ConflictCardProps> = ({ conflict }) => (
  <div className="relative overflow-hidden rounded-2xl border border-line-subtle bg-surface-sunken p-4">
    <div className="absolute right-0 top-0 h-full w-[30%] bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.1),transparent_70%)]" />
    <div className="relative">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{conflict.date}</span>
        </div>
        <Badge
          variant="outline"
          className="border-rose-500/30 bg-rose-500/15 text-rose-800 dark:text-rose-400"
        >
          {conflict.users.length} member{conflict.users.length !== 1 ? "s" : ""}
        </Badge>
      </div>
      <Separator className="mb-3 bg-border dark:bg-line-subtle" />
      <div className="space-y-2">
        {conflict.users.map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-between rounded-lg bg-surface-sunken p-3"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">{user.name}</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`px-1.5 py-0.5 text-[10px] ${getTypeColor(user.type)}`}
                  >
                    {user.type}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`px-1.5 py-0.5 text-[10px] ${getStatusColor(user.status)}`}
                  >
                    {user.status}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
