import React from "react";
import type { UploadPreview } from "../types/ticketKPI";

interface TestMappingResultProps {
  result: UploadPreview;
}

export const TestMappingResult: React.FC<TestMappingResultProps> = ({ result }) => (
  <div className="space-y-3 rounded-md border p-4">
    <p className="text-sm font-medium">Result: {result.total_records} records</p>
    {result.errors.length > 0 && (
      <div className="space-y-1">
        {result.errors.map((err, i) => (
          <p key={i} className="text-xs text-destructive">
            {err}
          </p>
        ))}
      </div>
    )}
    {result.preview_rows.length > 0 && (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted">
            <tr>
              {Object.keys(result.preview_rows[0]).map((k) => (
                <th key={k} className="px-2 py-1 text-left">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.preview_rows.map((row, i) => (
              <tr key={i}>
                {Object.values(row).map((v, j) => (
                  <td key={j} className="px-2 py-1">
                    {String(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
