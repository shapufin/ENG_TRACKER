import React, { useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { MemberSelectField } from "./MemberSelectField";
import { useTeamMemberOptions } from "./useTeamMemberOptions";

interface StartEPRCycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: { user: number; year: number }) => Promise<void>;
}

export const StartEPRCycleDialog: React.FC<StartEPRCycleDialogProps> = ({
  open,
  onOpenChange,
  onCreate,
}) => {
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const { options: memberOptions, loadError } = useTeamMemberOptions(open);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const year = new Date().getFullYear();

  const canSubmit = employeeId !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || employeeId === null) return;
    setIsSubmitting(true);
    try {
      await onCreate({ user: employeeId, year });
      setEmployeeId(null);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Start ${year} EPR cycle`}
      description="Opens the review cycle: goal setting, mid-year and final review, with fixed due dates."
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Start cycle"
      submitDisabled={!canSubmit}
      size="sm"
    >
      <MemberSelectField
        id="epr-employee"
        value={employeeId}
        options={memberOptions}
        onChange={setEmployeeId}
        loadError={loadError}
      />
    </FormDialog>
  );
};
