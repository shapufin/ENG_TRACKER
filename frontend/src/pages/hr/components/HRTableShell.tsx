import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { TABLE_HEAD_CELL_CLASS, TABLE_HEAD_ROW_CLASS } from "@/components/ui/tableStyles";
import { cn } from "@/lib/utils";

interface HRTableHeader {
  label: string;
  align?: "left" | "center" | "right";
}

interface HRTableShellProps {
  title: string;
  headers: HRTableHeader[];
  children: React.ReactNode;
}

// Static class map: Tailwind only generates classes it can see literally in
// source, so `text-${align}` template construction would silently drop
// text-center/text-right from the CSS bundle the day no other file uses them.
const ALIGN_CLASSES = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

export const HRTableShell: React.FC<HRTableShellProps> = ({ title, headers, children }) => (
  <GlassCard className="border-border/70 overflow-hidden p-0 shadow-xl">
    <CardHeader className="bg-muted/20 border-b p-4">
      <CardTitle className="text-sm font-semibold">{title}</CardTitle>
    </CardHeader>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className={TABLE_HEAD_ROW_CLASS}>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={cn(TABLE_HEAD_CELL_CLASS, ALIGN_CLASSES[h.align || "left"])}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-border/40 divide-y">{children}</tbody>
      </table>
    </div>
  </GlassCard>
);
