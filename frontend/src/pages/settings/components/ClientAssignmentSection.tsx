import React from "react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ClientMultiSelect } from "./ClientMultiSelect";
import { Building2, Save, Users } from "lucide-react";
import { useClientAssignment } from "../hooks/useClientAssignment";
import type { UserProfile } from "@/types";

const displayName = (m: UserProfile): string => {
  const full = `${m.user.first_name ?? ""} ${m.user.last_name ?? ""}`.trim();
  return full || m.user.username;
};

/**
 * TL Client Assignment card (Settings page).
 *
 * Mockup: `Time Tracker UI Project/TL/settings.html` Client Assignment
 * table — one client picker per team member + Save Changes. Multi-select
 * (a member can work for several clients, same as their own My Clients
 * picker); saving replaces the member's full client set.
 */
export const ClientAssignmentSection: React.FC = () => {
  const { members, clients, effective, setDraft, saveAll, isSaving, isDirty, isLoading } =
    useClientAssignment();

  return (
    <GlassCard delay={0.08}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Client Assignment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Assign team members to business clients for accurate payroll export.
        </p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading team…</p>
        ) : members.length === 0 ? (
          <EmptyState icon={Users} title="No team members found" />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="pb-2 pr-2 font-medium">
                    Member
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Client
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {members.map((m) => {
                  const name = displayName(m);
                  const draft = effective[m.user.id] ?? [];
                  return (
                    <tr key={m.user.id}>
                      <td className="py-2 pr-2">
                        <span className="block font-medium">{name}</span>
                        <span className="block text-xs text-muted-foreground">
                          @{m.user.username}
                        </span>
                      </td>
                      <td className="py-2">
                        <ClientMultiSelect
                          clients={clients}
                          value={draft}
                          onChange={(ids) => setDraft(m.user.id, ids)}
                          triggerLabel={`Client for ${name}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="flex items-center gap-3 pt-1">
              <Button onClick={saveAll} disabled={!isDirty || isSaving}>
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving…" : "Save Changes"}
              </Button>
              {isDirty && !isSaving && (
                <span className="text-xs text-muted-foreground">Unsaved changes</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </GlassCard>
  );
};
