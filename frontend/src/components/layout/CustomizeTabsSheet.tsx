import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MAX_PINNED, MIN_PINNED } from "./hooks/usePinnedTabs";
import type { NavItem } from "./hooks/useVisibleNavItems";

interface CustomizeTabsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The sidebar's visible items: only these can be pinned. */
  items: NavItem[];
  pinnedPaths: string[];
  customized: boolean;
  onSave: (paths: string[]) => void;
  onReset: () => void;
}

const Body: React.FC<Omit<CustomizeTabsSheetProps, "open">> = ({
  onOpenChange,
  items,
  pinnedPaths,
  customized,
  onSave,
  onReset,
}) => {
  const [selected, setSelected] = useState(() => new Set(pinnedPaths));
  const count = selected.size;
  const valid = count >= MIN_PINNED && count <= MAX_PINNED;

  const toggle = (path: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(path);
      else next.delete(path);
      return next;
    });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Customize tab bar</DialogTitle>
        <DialogDescription>
          Choose the pages kept one tap away. Everything else stays under More.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <ul className="divide-border/50 divide-y">
          {items.map(({ path, label, icon: Icon }) => {
            const checked = selected.has(path);
            return (
              <li key={path}>
                <label className="flex min-h-11 items-center gap-3 py-2 text-sm">
                  <Checkbox
                    checked={checked}
                    disabled={!checked && count >= MAX_PINNED}
                    onCheckedChange={(value) => toggle(path, value === true)}
                    aria-label={label}
                  />
                  <Icon className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </label>
              </li>
            );
          })}
        </ul>
        {!valid && (
          <p className="text-muted-foreground mt-2 text-xs">
            Pick {MIN_PINNED} or {MAX_PINNED} pages
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        {customized && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onReset();
              onOpenChange(false);
            }}
          >
            Reset to default
          </Button>
        )}
        <Button
          type="button"
          disabled={!valid}
          onClick={() => {
            onSave(items.map((i) => i.path).filter((path) => selected.has(path)));
            onOpenChange(false);
          }}
        >
          Save
        </Button>
      </DialogFooter>
    </>
  );
};

/** Phone bottom sheet to choose which pages the tab bar pins. */
export const CustomizeTabsSheet: React.FC<CustomizeTabsSheetProps> = ({ open, ...rest }) => (
  <Dialog open={open} onOpenChange={rest.onOpenChange}>
    <DialogContent side="bottom" size="sm">
      {/* Mounted only while open so the selection re-seeds from the saved pins each time. */}
      <Body {...rest} />
    </DialogContent>
  </Dialog>
);
