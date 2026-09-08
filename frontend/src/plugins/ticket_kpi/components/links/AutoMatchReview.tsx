import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/context/PermissionContext";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { handleApiError } from "@/lib/error-handler";
import { ticketKPIService } from "../../services/ticketKPIService";

export const AutoMatchReview: React.FC = () => {
  const queryClient = useQueryClient();
  const { isTeamLeader, isAdmin, isSuperuser } = usePermissions();
  const { canManage } = usePluginPermissions();
  const canReview = canManage("ticket_kpi") && (isTeamLeader || isAdmin || isSuperuser);

  const { data: links = [], isLoading } = useQuery({
    queryKey: ["ticket_kpi", "links", "pending"],
    queryFn: () => ticketKPIService.getLinks({ review_status: "pending" }),
    enabled: canReview,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: "confirmed" | "rejected" }) =>
      ticketKPIService.reviewLink(id, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket_kpi", "links", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["ticket_kpi", "overtime-links"] });
    },
    onError: handleApiError,
  });

  if (!canReview || isLoading || links.length === 0) return null;

  return (
    <section className="space-y-2 rounded-md border p-4">
      <h2 className="text-sm font-semibold">Pending KPI ticket matches</h2>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.id} className="flex items-center justify-between gap-3 text-sm">
            <span>
              <strong>{link.ticket_id}</strong>
              <span className="ml-2 text-muted-foreground">
                {link.overtime_user} · {link.overtime_date} · {link.overtime_hours}h
              </span>
            </span>
            <span className="flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Confirm match ${link.ticket_id}`}
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ id: link.id, decision: "confirmed" })}
              >
                <Check className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Reject match ${link.ticket_id}`}
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ id: link.id, decision: "rejected" })}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};
