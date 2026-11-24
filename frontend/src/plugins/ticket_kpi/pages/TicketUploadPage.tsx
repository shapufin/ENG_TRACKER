import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMemberIdentity } from "./hooks/useMemberIdentity";
import { PageShell } from "@/components/layout/PageShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { Ticket } from "lucide-react";
import { UploadForm } from "../components/UploadForm";
import { UploadPreviewPanel } from "../components/UploadPreviewPanel";
import { ticketKPIService } from "../services/ticketKPIService";
import { useActiveClients } from "@/hooks/useActiveClients";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import type { UploadPreview } from "../types/ticketKPI";
import type { Client } from "@/types";
import { getLastUploadSelection, saveLastUploadSelection } from "../utils/lastUploadSelection";

export const TicketUploadPage: React.FC = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  // `?for=<userId>`: a leader (or admin) importing a member's tickets. The
  // backend decides who may; this only changes whose clients are offered.
  const [searchParams] = useSearchParams();
  const forUserId = Number(searchParams.get("for")) || undefined;
  const [month, setMonth] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [selectedClientIds, setSelectedClientIds] = useState<number[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, string>>({});
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [saveMappingOverrides, setSaveMappingOverrides] = useState(false);
  const [isRemapping, setIsRemapping] = useState(false);

  const { data: profiles } = useQuery({
    queryKey: ["ticket_kpi", "profiles"],
    queryFn: () => ticketKPIService.getProfiles(),
  });

  const { data: allClients } = useActiveClients();

  // Filter clients to those assigned to the current user (defense-in-depth;
  // backend also scopes ClientViewSet to user.profile.clients for non-admins).
  // Admin/staff have no client_ids restriction so they can tag uploads for
  // any client.
  // A non-admin needs at least one assigned client to import (owner ruling
  // 2026-11-18); "no clients" no longer means "every client".
  const isAdmin = Boolean(user?.is_staff || user?.is_superuser);

  const {
    name: memberName,
    clientIds: memberClientIds,
    squadLoaded,
  } = useMemberIdentity(forUserId);
  // Whose clients decide what can be tagged: the member's on an on-behalf
  // import (the backend checks the same), the importer's own otherwise.
  const ownerClientIds = forUserId ? memberClientIds : user?.client_ids;
  const ownerClientsKnown = !forUserId || isAdmin || squadLoaded;
  const clients = useMemo<Client[]>(() => {
    if (isAdmin) return allClients ?? [];
    const allowed = new Set(ownerClientIds ?? []);
    return (allClients ?? []).filter((c) => allowed.has(c.id));
  }, [allClients, ownerClientIds, isAdmin]);
  const hasNoClient =
    Boolean(user) && !isAdmin && ownerClientsKnown && (ownerClientIds?.length ?? 0) === 0;

  const selectedProfile = useMemo(
    () => profiles?.find((p) => p.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId]
  );

  // Persisting a mapping fix back onto the shared profile affects every
  // future upload against it, so only the profile's creator or an admin may
  // opt into "save this mapping" — matches the backend check in
  // TicketUploadViewSet.import_batch.
  const canSaveMapping = Boolean(
    user &&
    (user.is_staff ||
      user.is_superuser ||
      (selectedProfile && selectedProfile.created_by === user.id))
  );

  const currentMapping =
    preview?.effective_field_mapping ?? selectedProfile?.field_mapping ?? mappingOverrides;

  // Pre-fill from the last upload's profile + clients once both lists have
  // loaded, so a monthly re-upload for the same client doesn't repeat the
  // same two clicks every time. Runs once (guarded by the ref) — after that,
  // the user's own choices must win, not a stale localStorage read racing a
  // slow second query.
  const appliedLastSelection = useRef(false);
  useEffect(() => {
    if (appliedLastSelection.current) return;
    // Gate on the queries having settled, not on non-empty results — a user
    // with zero assigned clients is a valid state, not "still loading".
    if (forUserId || !user?.id || !profiles || !allClients) return;
    appliedLastSelection.current = true;
    const last = getLastUploadSelection(
      user.id,
      new Set(profiles.map((p) => p.id)),
      new Set(clients.map((c) => c.id))
    );
    if (!last) return;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration
       from localStorage once the profile/client queries resolve; there is
       no way to know this until those async results arrive. */
    if (last.profileId !== null) setSelectedProfileId(last.profileId);
    if (last.clientIds.length > 0) setSelectedClientIds(last.clientIds);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [user?.id, forUserId, profiles, allClients, clients]);

  const handleFileAccepted = (f: File) => {
    setFile(f);
    setPreview(null);
    setDetectedColumns([]);
    setMappingOverrides({});
    setStatusOverrides({});
    setSaveMappingOverrides(false);
  };

  const handleClientToggle = (clientId: number, checked: boolean) => {
    setSelectedClientIds((prev) =>
      checked ? [...prev, clientId] : prev.filter((id) => id !== clientId)
    );
  };

  // fallow-ignore-next-line complexity
  const handleAnalyze = async () => {
    if (!file) return;
    setIsAnalyzing(true);
    try {
      const { data } = await ticketKPIService.analyzeFile(file);
      toast.success(`Analyzed ${data.total_rows} rows`);
      setDetectedColumns(data.detected_columns || []);

      // A team format that was tried and rejected says why (a missing column, no
      // header row); that is more useful than a generic "no match".
      const hint = data.profile_hints?.[0];
      if (hint && !selectedProfileId && !data.suggested_profile) {
        toast.error(`${hint.profile}: ${hint.reason}`);
        setIsAnalyzing(false);
        return;
      }

      // The file's own dates usually say what month this is — no need to
      // make the user pick it before they can even see what's in the file.
      // An explicit choice already made is never overridden.
      const suggestedMonth = data.suggested_month?.slice(0, 7);
      const resolvedMonth = month || suggestedMonth || "";
      if (!resolvedMonth) {
        toast.error("Could not detect the month from the file. Please select one.");
        setIsAnalyzing(false);
        return;
      }
      if (!month) setMonth(resolvedMonth);

      const profileId = selectedProfileId ?? data.suggested_profile?.id ?? null;
      if (!profileId) {
        toast.error("No matching profile found. Please select one below.");
        setIsAnalyzing(false);
        return;
      }
      setSelectedProfileId(profileId);

      const monthDate = `${resolvedMonth}-01`;
      const previewRes = await ticketKPIService.previewUpload(
        file,
        profileId,
        monthDate,
        undefined,
        undefined,
        forUserId
      );
      setPreview(previewRes.data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.detail || "Analyze failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRemapPreview = async (
    mapping: Record<string, string>,
    statuses: Record<string, string> = statusOverrides
  ) => {
    if (!file || !month || !selectedProfileId) return;
    setIsRemapping(true);
    try {
      const monthDate = `${month}-01`;
      const previewRes = await ticketKPIService.previewUpload(
        file,
        selectedProfileId,
        monthDate,
        mapping,
        statuses,
        forUserId
      );
      setPreview(previewRes.data);
      setMappingOverrides(mapping);
      setStatusOverrides(statuses);
      toast.success("Mapping updated");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.detail || "Could not re-preview with this mapping");
    } finally {
      setIsRemapping(false);
    }
  };

  // fallow-ignore-next-line complexity
  const handleImport = async (override: boolean) => {
    if (!file || !month || !selectedProfileId) return;
    setIsImporting(true);
    try {
      const monthDate = `${month}-01`;
      const { data } = await ticketKPIService.commitUpload(
        file,
        selectedProfileId,
        monthDate,
        override,
        selectedClientIds,
        mappingOverrides,
        saveMappingOverrides,
        statusOverrides,
        forUserId
      );
      toast.success(`Imported ${data.record_count} tickets for ${data.month}`);
      if (user?.id && !forUserId) {
        saveLastUploadSelection(user.id, {
          profileId: selectedProfileId,
          clientIds: selectedClientIds,
        });
      }
      setFile(null);
      setPreview(null);
      setSelectedProfileId(null);
      setMonth("");
      setDetectedColumns([]);
      setMappingOverrides({});
      setStatusOverrides({});
      setSaveMappingOverrides(false);
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "my_batches"] });
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "dashboard"] });
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "team_summary"] });
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "team_batches"] });
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "monthly_summary"] });
      if (forUserId) navigate(`/ticket-kpi/dashboard?user_id=${forUserId}&month=${monthDate}`);
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "trend"] });
      qc.invalidateQueries({ queryKey: ["ticket_kpi", "categories"] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.response?.status === 403) {
        toast.error(err.response?.data?.error || "Only administrators can override imports.");
      } else if (err.response?.status === 409) {
        toast.error("Import exists. Only administrators can override.");
      } else {
        toast.error(err.response?.data?.error || err.response?.data?.detail || "Import failed");
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <PageShell
      title="Import Tickets"
      subtitle={
        forUserId
          ? `Importing the monthly ticket export for ${memberName ?? "this member"}.`
          : "Import your monthly ticket export file."
      }
    >
      <div className="mx-auto max-w-4xl space-y-6">
        {hasNoClient && (
          <EmptyState
            icon={Ticket}
            title="No client assigned yet"
            description={
              forUserId
                ? "This member has no client assigned. Assign one in Settings, Client Assignment, then import their tickets."
                : "Ask your Line Manager to assign a client to you (Settings, Client Assignment). You can import tickets once a client is assigned."
            }
          />
        )}
        {!hasNoClient && (
          <>
            {forUserId && (
              <div className="border-tone-info-border bg-tone-info-surface text-tone-info-text rounded-lg border px-3 py-2 text-sm">
                You are importing for <strong>{memberName ?? "this member"}</strong>. The tickets
                will appear on their dashboard, and you stay recorded as the person who imported
                them.
              </div>
            )}
            <UploadForm
              month={month}
              onMonthChange={setMonth}
              file={file}
              onFileAccepted={handleFileAccepted}
              isDragging={isDragging}
              setIsDragging={setIsDragging}
              selectedProfileId={selectedProfileId}
              onProfileChange={setSelectedProfileId}
              selectedClientIds={selectedClientIds}
              onClientToggle={handleClientToggle}
              profiles={profiles}
              clients={clients}
              onAnalyze={handleAnalyze}
              isAnalyzing={isAnalyzing}
            />

            {preview && (
              <UploadPreviewPanel
                preview={preview}
                onImport={handleImport}
                isImporting={isImporting}
                detectedColumns={detectedColumns}
                currentMapping={currentMapping}
                onRemap={handleRemapPreview}
                onMapStatuses={(draft) =>
                  handleRemapPreview(mappingOverrides, { ...statusOverrides, ...draft })
                }
                isRemapping={isRemapping}
                canSaveMapping={canSaveMapping}
                saveMappingOverrides={saveMappingOverrides}
                onSaveMappingOverridesChange={setSaveMappingOverrides}
              />
            )}
          </>
        )}
      </div>
    </PageShell>
  );
};
