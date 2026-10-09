import React from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar, User } from "lucide-react";
import { toneSurfaceClass } from "@/components/ui/tone";
import type { ConflictEntry } from "./ConflictsModal";

interface ConflictCardProps {
  conflict: ConflictEntry;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "approved":
      return toneSurfaceClass.success;
    case "rejected":
      return toneSurfaceClass.danger;
    case "pending":
    default:
      return toneSurfaceClass.warning;
  }
};

const getTypeColor = (type: string) => {
  switch (type) {
    case "vacation":
      return toneSurfaceClass.success;
    case "sick":
      return toneSurfaceClass.danger;
    default:
      return toneSurfaceClass.neutral;
  }
};

export const ConflictCard: React.FC<ConflictCardProps> = ({ conflict }) => (
  <div className="border-line-subtle bg-surface-sunken relative overflow-hidden rounded-2xl border p-4">
    <div className="absolute top-0 right-0 h-full w-[30%] bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.1),transparent_70%)]" />
    <div className="relative">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="text-muted-foreground h-4 w-4" />
          <span className="font-medium">{conflict.date}</span>
        </div>
        <Badge variant="outline" className={toneSurfaceClass.danger}>
          {conflict.users.length} member{conflict.users.length !== 1 ? "s" : ""}
        </Badge>
      </div>
      <Separator className="bg-border dark:bg-line-subtle mb-3" />
      <div className="space-y-2">
        {conflict.users.map((user) => (
          <div
            key={user.id}
            className="bg-surface-sunken flex items-center justify-between rounded-lg p-3"
          >
            <div className="flex items-center gap-3">
              <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full">
                <User className="text-muted-foreground h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">{user.name}</p>
                <div className="mt-0.5 flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`px-1.5 py-0.5 text-xs ${getTypeColor(user.type)}`}
                  >
                    {user.type}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`px-1.5 py-0.5 text-xs ${getStatusColor(user.status)}`}
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
