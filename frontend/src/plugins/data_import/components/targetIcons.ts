import {
  Banknote,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  Clock,
  Cpu,
  FileSpreadsheet,
  FolderTree,
  MonitorCog,
  PhoneCall,
  Sparkles,
  Star,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

/** Static map (no dynamic lucide lookup, to keep the bundle small) of backend `icon` names. */
export const TARGET_ICONS: Record<string, LucideIcon> = {
  Building2,
  FolderTree,
  Sparkles,
  CalendarDays,
  Cpu,
  MonitorCog,
  CalendarCheck,
  UsersRound,
  Star,
  CalendarRange,
  PhoneCall,
  Users,
  Clock,
  Banknote,
};

export function targetIcon(name: string | undefined): LucideIcon {
  return (name && TARGET_ICONS[name]) || FileSpreadsheet;
}
