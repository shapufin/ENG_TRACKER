import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeCalendarGroup } from "@/lib/calendarGroup";
import type { Team } from "@/types";

interface TeamGroupAssignPopoverProps {
  team: Team;
  groups: string[];
  onAssign: (team: Team, group: string) => void;
}

/** One-click assignment of an ungrouped team to an existing or new calendar group. */
export const TeamGroupAssignPopover: React.FC<TeamGroupAssignPopoverProps> = ({
  team,
  groups,
  onAssign,
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const name = normalizeCalendarGroup(draft);

  const choose = (group: string) => {
    onAssign(team, group);
    setOpen(false);
    setDraft("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="control-sm" variant="outline" aria-label={`Assign ${team.name} to a group`}>
          Assign group
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        {groups.map((group) => (
          <Button
            key={group}
            variant="ghost"
            className="w-full justify-start font-normal"
            onClick={() => choose(group)}
          >
            {group}
          </Button>
        ))}
        <form
          className="mt-2 flex gap-2 border-t pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name) choose(name);
          }}
        >
          <Input
            aria-label="New group name"
            placeholder="New group"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button type="submit" size="control-sm" disabled={!name}>
            Save
          </Button>
        </form>
        {name && name !== draft.trim() && (
          <p className="text-muted-foreground mt-1 text-xs">Will be saved as "{name}"</p>
        )}
      </PopoverContent>
    </Popover>
  );
};
