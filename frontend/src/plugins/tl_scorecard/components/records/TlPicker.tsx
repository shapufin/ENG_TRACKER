import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { tlScorecardService } from "../../services/tlScorecardService";
import { isForbidden } from "../hbpr/isForbidden";

interface TlPickerProps {
  id: string;
  value: number | null;
  onChange: (id: number) => void;
}

/** Team leaders in the HBPR's scope; an HBPR has no team of their own, so this picks whose data to show. */
export const TlPicker: React.FC<TlPickerProps> = ({ id, value, onChange }) => {
  const overview = useQuery({
    queryKey: ["tl-scorecard", "hbpr-overview"],
    queryFn: () => tlScorecardService.getHbprOverview().then((r) => r.data),
  });

  return (
    <>
      <Select value={value === null ? "" : String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger id={id} disabled={overview.isLoading}>
          <SelectValue placeholder={overview.isLoading ? "Loading..." : "Select a team leader..."} />
        </SelectTrigger>
        <SelectContent>
          {(overview.data?.tls ?? []).map((tl) => (
            <SelectItem key={tl.id} value={String(tl.id)}>
              {tl.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {overview.isError && (
        <p role="alert" className="mt-1 text-xs text-tone-danger-text">
          {isForbidden(overview.error) ? "You do not have access to team leaders." : "Could not load team leaders."}
        </p>
      )}
    </>
  );
};
