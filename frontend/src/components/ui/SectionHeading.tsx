import React from "react";

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  meta?: React.ReactNode;
  id?: string;
}

/** Compact section heading: optional mono eyebrow pill, h2 title, right-aligned meta. */
export const SectionHeading: React.FC<SectionHeadingProps> = ({ eyebrow, title, meta, id }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
    <div className="flex min-w-0 items-center gap-2">
      {eyebrow && (
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-mono text-xs tracking-wider uppercase">
          {eyebrow}
        </span>
      )}
      <h2 id={id} className="text-base font-semibold text-balance">
        {title}
      </h2>
    </div>
    {meta && <div className="text-muted-foreground text-xs">{meta}</div>}
  </div>
);
