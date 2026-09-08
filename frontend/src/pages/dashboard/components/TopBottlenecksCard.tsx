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
          <p className="mt-1 text-muted-foreground">Last 5 approvals</p>
        </div>
        <span className="text-sm text-muted-foreground">Last 5</span>
      </div>
      <div className="space-y-3 p-6 pt-0">
        {isLoading && (
          <>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex animate-pulse items-center justify-between rounded-2xl border border-border/30 bg-muted/30 p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-muted/50" />
                  <div className="h-6 w-32 rounded bg-muted/50" />
                </div>
                <div className="h-8 w-20 rounded-full bg-muted/50" />
              </div>
            ))}
          </>
        )}
        {isError && <p className="text-sm text-destructive">Failed to load user data.</p>}
        {!isLoading && !isError && users.length === 0 && (
          <EmptyState icon={CheckCircle2} title="No pending work" className="p-6" />
        )}
        {users.map((userEntry) => (
          <div
            key={userEntry.userId}
            className="flex items-center justify-between rounded-2xl border border-border/30 bg-muted/30 p-4 transition-all hover:border-border/60"
          >
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12 border border-primary/20">
                <AvatarFallback className="bg-primary/15 text-base text-primary">
                  {userEntry.userName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-xl font-semibold">{userEntry.userName}</p>
                <p className="mt-1 text-sm text-muted-foreground">Team member with highest queue</p>
              </div>
            </div>
            <Badge className="rounded-full border border-destructive/20 bg-destructive/10 px-4 py-1 text-destructive">
              {userEntry.count} pending
            </Badge>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};
