import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CheckCircle2 } from "lucide-react";

interface TopPendingUser {
  userId: number;
  userName: string;
  count: number;
}

interface TopBottlenecksCardProps {
  users: TopPendingUser[];
  isLoading: boolean;
  isError: boolean;
}

export const TopBottlenecksCard: React.FC<TopBottlenecksCardProps> = ({
  users,
  isLoading,
  isError,
}) => {
  return (
    <GlassCard>
      <div className="flex flex-row items-start justify-between p-4">
        <div>
          <h3 className="text-xl font-semibold">Top Bottlenecks</h3>
          <p className="text-muted-foreground mt-1">Last 5 approvals</p>
        </div>
        <span className="text-muted-foreground text-sm">Last 5</span>
      </div>
      <div className="space-y-3 p-6 pt-0">
        {isLoading && (
          <>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="border-border bg-card flex animate-pulse items-center justify-between rounded-2xl border p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-muted/50 h-12 w-12 rounded-full" />
                  <div className="bg-muted/50 h-6 w-32 rounded" />
                </div>
                <div className="bg-muted/50 h-8 w-20 rounded-full" />
              </div>
            ))}
          </>
        )}
        {isError && <p className="text-destructive text-sm">Failed to load user data.</p>}
        {!isLoading && !isError && users.length === 0 && (
          <EmptyState icon={CheckCircle2} title="No pending work" className="p-6" />
        )}
        {users.map((userEntry) => (
          <div
            key={userEntry.userId}
            className="border-border bg-card hover:border-border/60 flex items-center justify-between rounded-2xl border p-4 transition-all"
          >
            <div className="flex items-center gap-4">
              <Avatar className="border-primary/20 h-12 w-12 border">
                <AvatarFallback className="bg-primary/15 text-primary text-base">
                  {userEntry.userName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-xl font-semibold">{userEntry.userName}</p>
                <p className="text-muted-foreground mt-1 text-sm">Team member with highest queue</p>
              </div>
            </div>
            <Badge className="border-destructive/20 bg-destructive/10 text-destructive rounded-full border px-4 py-1">
              {userEntry.count} pending
            </Badge>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};
