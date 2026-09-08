import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardHeader, CardTitle } from "@/components/ui/card";

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
  <GlassCard className="overflow-hidden border-border/70 p-0 shadow-xl">
    <CardHeader className="border-b bg-muted/20 p-4">
      <CardTitle className="text-sm font-semibold">{title}</CardTitle>
    </CardHeader>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className={`px-6 py-4 ${ALIGN_CLASSES[h.align || "left"]}`}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">{children}</tbody>
      </table>
    </div>
  </GlassCard>
);
