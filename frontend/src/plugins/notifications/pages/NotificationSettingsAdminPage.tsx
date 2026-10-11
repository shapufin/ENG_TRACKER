import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, BellRing } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/PageShell";
import { StatCard } from "@/components/ui/StatCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { SearchField } from "@/components/ui/SearchField";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { handleApiError } from "@/lib/error-handler";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import { notificationService, type NotificationTypeConfig } from "../service";

// Admin-facing query key: exact, never the bare ["admin"] prefix.
const CONFIG_QUERY_KEY = ["admin", "notification-config"];

type Audience = NotificationTypeConfig["audience"];
type StatusFilter = "on" | "off";

// Copy mirrors the recipient rules in NotificationViewSet._available_preference_pairs.
const AUDIENCES: { value: Audience; chip: string; title: string }[] = [
  { value: "own", chip: "Everyone", title: "Everyone (own requests)" },
  { value: "team", chip: "Team leaders", title: "Team leaders, HR & admins" },
  { value: "oversight", chip: "Oversight", title: "HR, HBPR & admins" },
];

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

const ALWAYS_ON_COPY = "Always delivered — not shown in user settings";

export const NotificationSettingsAdminPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [audienceFilter, setAudienceFilter] = useState<Audience[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter[]>([]);
  const [pendingOff, setPendingOff] = useState<NotificationTypeConfig | null>(null);

  const {
    data: rows,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: CONFIG_QUERY_KEY,
    queryFn: () => notificationService.getEventTypeConfig(),
  });

  const toggle = useMutation({
    mutationFn: ({ row, enabled }: { row: NotificationTypeConfig; enabled: boolean }) =>
      notificationService.setEventTypeEnabled(row.key, enabled),
    onMutate: async ({ row, enabled }) => {
      await queryClient.cancelQueries({ queryKey: CONFIG_QUERY_KEY });
      const previous = queryClient.getQueryData<NotificationTypeConfig[]>(CONFIG_QUERY_KEY);
      queryClient.setQueryData<NotificationTypeConfig[]>(CONFIG_QUERY_KEY, (current) =>
        current?.map((item) =>
          item.key === row.key ? { ...item, enabled, partially_enabled: false } : item
        )
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(CONFIG_QUERY_KEY, context.previous);
      handleApiError(error);
    },
    onSuccess: (_result, { row, enabled }) => {
      toast.success(`${row.label} ${enabled ? "turned on" : "turned off"}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: CONFIG_QUERY_KEY }),
  });

  const { mutate } = toggle;
  const busyKey = toggle.isPending ? (toggle.variables?.row.key ?? null) : null;

  const columns = useMemo<AppColumnDef<NotificationTypeConfig, unknown>[]>(
    () => [
      {
        id: "notification",
        accessorKey: "label",
        header: "Notification",
        cell: ({ row }) => (
          <span className="flex flex-col gap-0.5">
            <span className="text-foreground font-medium">{row.original.label}</span>
            {row.original.description && (
              <span className="text-muted-foreground text-xs">{row.original.description}</span>
            )}
          </span>
        ),
      },
      {
        id: "audience",
        header: "Delivered to",
        cell: ({ row }) => (
          <Badge variant="outline">
            {AUDIENCES.find((a) => a.value === row.original.audience)?.chip ?? "Everyone"}
          </Badge>
        ),
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) =>
          row.original.user_configurable ? (
            <span className="text-muted-foreground text-sm">Configurable</span>
          ) : (
            <Badge variant="neutral" className="whitespace-normal">
              {ALWAYS_ON_COPY}
            </Badge>
          ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const item = row.original;
          return (
            <span className="flex flex-wrap items-center gap-3">
              <Switch
                aria-label={`Enable ${item.label}`}
                checked={item.enabled}
                disabled={busyKey === item.key}
                onCheckedChange={(checked) => {
                  if (checked) mutate({ row: item, enabled: true });
                  else setPendingOff(item);
                }}
              />
              <span className="text-muted-foreground text-sm">{item.enabled ? "On" : "Off"}</span>
              {item.partially_enabled && <Badge variant="warning">Partially on</Badge>}
            </span>
          );
        },
      },
    ],
    [busyKey, mutate]
  );

  if (isLoading) return <LoadingCard rows={4} className="min-h-[300px]" />;
  if (isError || !rows) {
    return <ErrorCard title="Could not load notification types" onRetry={() => void refetch()} />;
  }

  const query = search.trim().toLowerCase();
  const visible = rows.filter((item) => {
    if (query && !`${item.label} ${item.description}`.toLowerCase().includes(query)) return false;
    if (audienceFilter.length && !audienceFilter.includes(item.audience)) return false;
    if (statusFilter.length && !statusFilter.includes(item.enabled ? "on" : "off")) return false;
    return true;
  });

  const enabledCount = rows.filter((item) => item.enabled).length;
  const toggleIn = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <PageShell
      title="Notification types"
      subtitle="Turn a notification off for everyone. Disabled types disappear from every user's Settings page and are no longer sent."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total types" value={rows.length} icon={Bell} delay={0} />
        <StatCard label="Enabled" value={enabledCount} icon={BellRing} delay={0.05} />
        <StatCard label="Disabled" value={rows.length - enabledCount} icon={BellOff} delay={0.1} />
      </div>

      <FilterToolbar className="flex-col items-stretch gap-3">
        <FilterToolbar.Search className="max-w-none">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Filter by name"
            aria-label="Filter notification types by name"
          />
        </FilterToolbar.Search>
        <FilterChipRow
          label="Audience"
          options={AUDIENCES.map((a) => ({ value: a.value, label: a.chip }))}
          selected={audienceFilter}
          onToggle={(value) => setAudienceFilter((current) => toggleIn(current, value))}
        />
        <FilterChipRow
          label="Status"
          options={STATUS_CHIPS}
          selected={statusFilter}
          onToggle={(value) => setStatusFilter((current) => toggleIn(current, value))}
        />
      </FilterToolbar>

      {AUDIENCES.map((audience, index) => {
        const group = visible.filter((item) => item.audience === audience.value);
        if (group.length === 0) return null;
        return (
          <GlassCard key={audience.value} delay={0.05 * index} className="space-y-3 p-4">
            <h2 className="text-foreground text-sm font-semibold">{audience.title}</h2>
            <DataTable
              columns={columns}
              data={group}
              getRowId={(item) => item.key}
              emptyMessage="No notification types match these filters."
            />
          </GlassCard>
        );
      })}

      <ConfirmDialog
        open={pendingOff !== null}
        onOpenChange={(open) => {
          if (!open) setPendingOff(null);
        }}
        title={pendingOff ? `Disable "${pendingOff.label}" for everyone?` : ""}
        description="It is hidden from every user's Settings page and nothing is sent for it. Notifications already delivered are kept."
        confirmLabel="Disable for everyone"
        variant="destructive"
        onConfirm={() => {
          if (!pendingOff) return;
          mutate({ row: pendingOff, enabled: false });
          setPendingOff(null);
        }}
      >
        {pendingOff && !pendingOff.user_configurable && (
          <p className="text-muted-foreground text-sm">
            This type is always delivered, so turning it off here stops it for everyone.
          </p>
        )}
      </ConfirmDialog>
    </PageShell>
  );
};
