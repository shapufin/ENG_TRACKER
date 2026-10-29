import React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Option {
  id: number;
  name: string;
}

export interface SkillsLeaderFiltersProps {
  italianTLs: Option[];
  albanianTLs: Option[];
  techs: Option[];
  italianTl: string;
  albanianTl: string;
  tech: string;
  onItalianTlChange: (value: string) => void;
  onAlbanianTlChange: (value: string) => void;
  onTechChange: (value: string) => void;
}

const FilterSelect: React.FC<{
  id: string;
  label: string;
  allLabel: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}> = ({ id, label, allLabel, options, value, onChange }) => (
  <div>
    <Label htmlFor={id}>{label}</Label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="mt-1 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={String(o.id)}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

/** Italian TL, Albanian TL and Tech: only offered to HR and admins, whose view spans every team. */
export const SkillsLeaderFilters: React.FC<SkillsLeaderFiltersProps> = (props) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
    <FilterSelect
      id="team-italian-tl"
      label="Italian TL"
      allLabel="All Italian TLs"
      options={props.italianTLs}
      value={props.italianTl}
      onChange={props.onItalianTlChange}
    />
    <FilterSelect
      id="team-albanian-tl"
      label="Albanian TL"
      allLabel="All Albanian TLs"
      options={props.albanianTLs}
      value={props.albanianTl}
      onChange={props.onAlbanianTlChange}
    />
    <FilterSelect
      id="team-tech"
      label="Tech"
      allLabel="All Techs"
      options={props.techs}
      value={props.tech}
      onChange={props.onTechChange}
    />
  </div>
);
