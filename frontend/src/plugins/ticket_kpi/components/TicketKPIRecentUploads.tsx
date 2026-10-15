import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMonthLabel } from "@/lib/monthOptions";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TicketKPIRecentUploads: React.FC<{ batches: any[] | undefined }> = ({ batches }) => (
  <Card>
    <CardHeader>
      <CardTitle>Recent Uploads</CardTitle>
    </CardHeader>
    <CardContent>
      {!batches || batches.length === 0 ? (
        <p className="text-muted-foreground text-sm">No uploads yet.</p>
      ) : (
        <div className="space-y-3">
          {batches.slice(0, 5).map((batch) => (
            <div key={batch.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-foreground text-sm font-medium">
                  {formatMonthLabel(batch.month)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {batch.record_count} tickets · {batch.profile_name}
                </p>
              </div>
              <p className="text-muted-foreground text-xs">
                {formatDateDDMMYYYY(batch.created_at?.slice(0, 10))}
              </p>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);
