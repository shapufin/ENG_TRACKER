import React from "react";
import { DatePicker } from "@/components/ui/DatePicker";
import { Label } from "@/components/ui/label";
import { ModalSection } from "@/components/ui/ModalSection";
import { TeamMultiSelect } from "@/components/admin/TeamMultiSelect";
import { TechMultiSelect } from "@/components/admin/TechMultiSelect";
import { FormInputField, FormRoleCheckboxes, FormTLSelect } from "./userFormFields";
import type { Tech, Team } from "@/types";

interface UserFormCoreForm {
  phone: string;
  teams: number[];
  techs: number[];
  albanian_tl: string;
  italian_tl: string;
  is_hr_user: boolean;
  is_italian_tl_role: boolean;
  is_albanian_tl_role: boolean;
  is_cr_admin?: boolean;
  hire_date?: string;
}

interface UserFormCoreProps {
  form: UserFormCoreForm;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateField: (key: string, value: any) => void;
  prefix: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  teamsData: any[];
  techsData: Tech[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  albanianTLs: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  italianTLs: any[];
  showHireDate?: boolean;
}

export const UserFormCore: React.FC<UserFormCoreProps> = ({
  form,
  updateField,
  prefix,
  teamsData,
  techsData,
  albanianTLs,
  italianTLs,
  showHireDate,
}) => {
  const teams = (teamsData || []) as unknown as Team[];
  return (
    <>
      <ModalSection title="Assignment" columns={2}>
        <FormInputField
          label="Phone"
          value={form.phone}
          onChange={(v) => updateField("phone", v)}
        />
        {showHireDate && (
          <div className="space-y-2">
            <Label>Hire Date</Label>
            <DatePicker
              value={form.hire_date || ""}
              onChange={(v) => updateField("hire_date", v)}
              placeholder="DD/MM/YYYY"
            />
          </div>
        )}
        <div className="space-y-2">
          <Label>Teams</Label>
          <TeamMultiSelect
            teams={teams}
            value={form.teams}
            onChange={(ids) => updateField("teams", ids)}
            placeholder="No team"
          />
        </div>
        <div className="space-y-2">
          <Label>Tech</Label>
          <TechMultiSelect
            techs={techsData}
            value={form.techs}
            onChange={(ids) => updateField("techs", ids)}
            placeholder="No Tech"
          />
        </div>
        <FormTLSelect
          label="Albanian TL"
          value={form.albanian_tl}
          onChange={(v) => updateField("albanian_tl", v)}
          tls={albanianTLs}
        />
        <FormTLSelect
          label="Italian TL"
          value={form.italian_tl}
          onChange={(v) => updateField("italian_tl", v)}
          tls={italianTLs}
        />
      </ModalSection>
      <ModalSection title="Roles" columns={1}>
        <FormRoleCheckboxes
          is_hr_user={form.is_hr_user}
          is_italian_tl_role={form.is_italian_tl_role}
          is_albanian_tl_role={form.is_albanian_tl_role}
          is_cr_admin={form.is_cr_admin}
          prefix={prefix}
          onChange={(key, value) => updateField(key, value)}
        />
      </ModalSection>
    </>
  );
};
