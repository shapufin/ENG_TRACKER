import React from "react";

import { FormDialog } from "@/components/ui/FormDialog";
import { FormField } from "@/components/ui/FormField";
import { ModalSection } from "@/components/ui/ModalSection";
import type { Tech } from "@/types";

interface TechFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Tech | null;
  form: { name: string; code: string };
  onFormChange: (form: TechFormDialogProps["form"]) => void;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
}

export const TechFormDialog: React.FC<TechFormDialogProps> = ({
  open,
  onOpenChange,
  editing,
  form,
  onFormChange,
  onSubmit,
  isSubmitting,
}) => (
  <FormDialog
    open={open}
    onOpenChange={onOpenChange}
    title={editing ? `Edit ${editing.name}` : "Add Tech"}
    size="md"
    submitLabel={editing ? "Save" : "Add"}
    submitDisabled={!form.name.trim() || !form.code.trim()}
    onSubmit={onSubmit}
    isSubmitting={isSubmitting}
  >
    <ModalSection title="Tech identity" columns={2}>
      <FormField
        id="tech-name"
        label="Name"
        placeholder="e.g. Infrastructure"
        value={form.name}
        onChange={(value) => onFormChange({ ...form, name: value })}
        required
      />
      <FormField
        id="tech-code"
        label="Code"
        placeholder="e.g. INFRA"
        value={form.code}
        onChange={(value) => onFormChange({ ...form, code: value })}
        required
      />
    </ModalSection>
  </FormDialog>
);
