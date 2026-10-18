import React from "react";

import { FormDialog } from "@/components/ui/FormDialog";
import { FormField } from "@/components/ui/FormField";
import { ModalSection } from "@/components/ui/ModalSection";
import type { Client } from "@/types";

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Client | null;
  form: { name: string; code: string; description: string };
  formErrors: Record<string, string>;
  onFieldChange: (key: keyof ClientFormDialogProps["form"], value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
}

export const ClientFormDialog: React.FC<ClientFormDialogProps> = ({
  open,
  onOpenChange,
  editing,
  form,
  formErrors,
  onFieldChange,
  onSubmit,
  isSubmitting,
}) => (
  <FormDialog
    open={open}
    onOpenChange={onOpenChange}
    title={editing ? "Edit Client" : "New Client"}
    description="Clients group overtime and standby records for reporting."
    onSubmit={onSubmit}
    isSubmitting={isSubmitting}
  >
    <ModalSection title="Client details" columns={2}>
      <FormField
        id="client-name"
        label="Name"
        value={form.name}
        onChange={(value) => onFieldChange("name", value)}
        error={formErrors.name}
        required
      />
      <FormField
        id="client-code"
        label="Code"
        value={form.code}
        onChange={(value) => onFieldChange("code", value)}
        error={formErrors.code}
        required
      />
      <FormField
        id="client-description"
        label="Description"
        value={form.description}
        onChange={(value) => onFieldChange("description", value)}
        error={formErrors.description}
        className="sm:col-span-2"
      />
    </ModalSection>
    {formErrors.non_field_errors && (
      <p className="text-destructive text-xs">{formErrors.non_field_errors}</p>
    )}
  </FormDialog>
);
