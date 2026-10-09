import React, { useMemo, useState } from "react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/SearchField";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Building2, Check, ChevronsUpDown, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMyClients } from "../hooks/useMyClients";

interface MyClientsSectionProps {
  assignedClientIds: number[];
  onAssignedChange: () => Promise<unknown>;
}

export const MyClientsSection: React.FC<MyClientsSectionProps> = ({
  assignedClientIds,
  onAssignedChange,
}) => {
  const { available, selected, toggle, save, isSaving, isDirty, isLoading } = useMyClients({
    assignedClientIds,
    onAssignedChange,
  });

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedClients = useMemo(
    () => available.filter((c) => selected.includes(c.id)),
    [available, selected]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [available, query]);

  const triggerLabel =
    selected.length === 0
      ? "Select clients…"
      : selected.length === 1
        ? (selectedClients[0]?.name ?? "1 client")
        : `${selected.length} clients selected`;

  return (
    <GlassCard delay={0.07}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          My Clients
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Select the clients you work for. Overtime and KPI upload forms will only show these
          clients when you add entries.
        </p>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading clients…</p>
        ) : available.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No active clients are available yet. An administrator must create clients first.
          </p>
        ) : (
          <>
            {/* Searchable multi-select dropdown */}
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="control-lg"
                  role="combobox"
                  aria-expanded={open}
                  className="w-full justify-between font-normal"
                >
                  <span className="flex items-center gap-2 truncate">
                    <Building2 className="text-muted-foreground h-4 w-4 shrink-0" />
                    <span className={cn(selected.length === 0 && "text-muted-foreground")}>
                      {triggerLabel}
                    </span>
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                {/* Search input — sticky at top of the popover */}
                <div className="border-b p-2">
                  <SearchField
                    placeholder="Search clients…"
                    aria-label="Search clients"
                    value={query}
                    onChange={setQuery}
                  />
                </div>
                {/* Scrollable option list */}
                <div className="max-h-[260px] overflow-y-auto p-1">
                  {filtered.length === 0 ? (
                    <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                      No clients match “{query}”.
                    </p>
                  ) : (
                    filtered.map((client) => {
                      const checked = selected.includes(client.id);
                      return (
                        <label
                          key={client.id}
                          className={cn(
                            "hover:bg-muted/60 flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2 text-sm transition-colors",
                            checked && "bg-primary/5"
                          )}
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggle(client.id)} />
                          <span className="flex flex-1 flex-col">
                            <span className="font-medium">{client.name}</span>
                            {client.code && (
                              <span className="text-muted-foreground text-xs">{client.code}</span>
                            )}
                          </span>
                          {checked && <Check className="text-primary h-4 w-4" />}
                        </label>
                      );
                    })
                  )}
                </div>
                {available.length > 0 && (
                  <div className="text-muted-foreground border-t px-3 py-2 text-xs">
                    {selected.length} of {available.length} selected
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Selected client chips */}
            {selectedClients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedClients.map((c) => (
                  <Badge key={c.id} variant="secondary" className="gap-1 pr-1.5">
                    {c.name}
                    <button
                      type="button"
                      onClick={() => toggle(c.id)}
                      className="hover:bg-muted-foreground/20 rounded-full p-0.5"
                      aria-label={`Remove ${c.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-3 pt-1">
          <Button onClick={save} disabled={!isDirty || isSaving || available.length === 0}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving…" : "Save Clients"}
          </Button>
          {isDirty && !isSaving && (
            <span className="text-muted-foreground text-xs">Unsaved changes</span>
          )}
        </div>
      </CardContent>
    </GlassCard>
  );
};
