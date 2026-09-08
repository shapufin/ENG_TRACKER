import React from "react";
import { Badge } from "@/components/ui/badge";
import { Ticket, Clock, CheckCircle, Tag, Flag, CircleDot, FileText } from "lucide-react";

interface FieldsPopulatedBadgesProps {
  fields: string[] | undefined;
  max?: number;
}

const fieldConfig: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  tickets: { label: "Tickets", icon: Ticket },
  resolution_time: { label: "Resolution", icon: Clock },
  sla: { label: "SLA", icon: CheckCircle },
  category: { label: "Category", icon: Tag },
  priority: { label: "Priority", icon: Flag },
  status: { label: "Status", icon: CircleDot },
};

const fallbackIcon = FileText;

const normalizeKey = (key: string): string => {
  const lower = key.toLowerCase();
  if (lower === "status" || lower === "priority" || lower === "category") return lower;
  return key;
};

export const FieldsPopulatedBadges: React.FC<FieldsPopulatedBadgesProps> = ({
  fields,
  max = 4,
}) => {
  if (!fields || fields.length === 0) {
    return <span className="text-xs text-muted-foreground">No fields</span>;
  }

  const visible = fields.slice(0, max);
  const overflow = fields.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((rawKey) => {
        const key = normalizeKey(rawKey);
        const cfg = fieldConfig[key] ?? { label: rawKey, icon: fallbackIcon };
        const Icon = cfg.icon;
        return (
          <Badge key={rawKey} variant="outline" className="gap-1 text-[10px] font-normal">
            <Icon className="h-3 w-3" />
            {cfg.label}
          </Badge>
        );
      })}
      {overflow > 0 && (
        <Badge variant="outline" className="text-[10px] font-normal">
          +{overflow}
        </Badge>
      )}
    </div>
  );
};
