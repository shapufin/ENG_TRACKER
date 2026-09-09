import React, { useState } from "react";
import { Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/ui/DataTable";
import type { CredentialRow } from "../types/dataImport";

interface ImportCredentialsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credentials: CredentialRow[];
}

export const ImportCredentialsDialog: React.FC<ImportCredentialsDialogProps> = ({
  open,
  onOpenChange,
  credentials,
}) => {
  const [confirmed, setConfirmed] = useState(false);

  const columns = [
    { accessorKey: "username", header: "Username" },
    { accessorKey: "email", header: "Email" },
    { accessorKey: "password", header: "Password" },
  ];

  const downloadCSV = () => {
    const headers = ["username", "email", "password"];
    const rows = credentials.map((c) => [c.username, c.email, c.password]);
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((cell) => {
            const str = String(cell ?? "");
            const sanitized = str.replace(/^[=+\-@]/, "'$&");
            const escaped = sanitized.replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "imported_credentials.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Imported User Credentials</DialogTitle>
          <DialogDescription>
            These passwords are shown once and are not stored anywhere in plaintext. Download the
            CSV and share credentials securely.
          </DialogDescription>
        </DialogHeader>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-1 py-1">
          <DataTable columns={columns} data={credentials} pageSize={10} />
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 border-t pt-4 sm:flex-row">
          <Button variant="outline" onClick={downloadCSV}>
            <Download className="mr-2 h-4 w-4" />
            Download CSV
          </Button>
          <Button
            onClick={() => {
              setConfirmed(true);
              onOpenChange(false);
            }}
            disabled={confirmed}
          >
            {confirmed ? (
              <>
                <Check className="mr-2 h-4 w-4" /> Saved
              </>
            ) : (
              "I have saved these credentials"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
