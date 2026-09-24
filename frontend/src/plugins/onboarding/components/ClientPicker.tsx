import React from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OnboardingClient } from "../types/onboarding";

interface ClientPickerProps {
  clients: OnboardingClient[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export const ClientPicker: React.FC<ClientPickerProps> = ({ clients, selectedId, onSelect }) => {
  if (clients.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Client">
      {clients.map((c) => (
        <button
          key={c.id}
          type="button"
          role="tab"
          aria-selected={c.id === selectedId}
          onClick={() => onSelect(c.id)}
          className={cn(
            "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
            c.id === selectedId
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <Building2 className="h-4 w-4" aria-hidden="true" />
          {c.name}
        </button>
      ))}
    </div>
  );
};
