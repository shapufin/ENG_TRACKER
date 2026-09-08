import React from "react";
import { AlertCircle, Check, ChevronDown, Lock, Loader2, Rocket, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/badge";
import type { DraftPayload, OrgChart, ValidationResult } from "../types";

interface MutationState {
  isPending: boolean;
  error: unknown;
}

interface OrganigramaPublishStatusCardProps {
  chart: OrgChart;
  draft?: DraftPayload;
  draftLoading: boolean;
  validation: ValidationResult | undefined;
  validatePending: boolean;
  publish: MutationState;
  unpublish: MutationState;
  changeSummary: string;
  onChangeSummary: (value: string) => void;
  onValidate: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  formatError: (error: unknown) => string;
  formatTimestamp: (value: string | null) => string | null;
  audienceIsValid: boolean;
  isPublic: boolean;
  audienceMode: string;
  roleCodes: string[];
  groupCount: number;
  audienceLabels: Record<string, string>;
}

export const OrganigramaPublishStatusCard: React.FC<OrganigramaPublishStatusCardProps> = ({
  chart,
  draft,
  draftLoading,
  validation,
  validatePending,
  publish,
  unpublish,
  changeSummary,
  onChangeSummary,
  onValidate,
  onPublish,
  onUnpublish,
  formatError,
  formatTimestamp,
  audienceIsValid,
  isPublic,
  audienceMode,
  roleCodes,
  groupCount,
  audienceLabels,
}) => (
  <GlassCard className="space-y-6 p-4">
    <div>
      <h2 className="text-lg font-semibold">Publish</h2>
      <p className="text-sm text-muted-foreground">
        Validate the draft and publish an immutable revision.
      </p>
    </div>
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Status</span>
        <Badge variant={chart.status === "published" ? "default" : "secondary"}>
          {chart.status === "published" ? (
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3" /> Published
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <ChevronDown className="h-3 w-3" /> Draft
            </span>
          )}
        </Badge>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Draft revision</span>
        <span>{draftLoading ? "..." : (draft?.revision_number ?? "—")}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Draft nodes/edges</span>
        <span>
          {draftLoading ? "..." : `${draft?.nodes.length ?? 0} / ${draft?.edges.length ?? 0}`}
        </span>
      </div>
      {chart.published_at && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Last published</span>
          <span>{formatTimestamp(chart.published_at)}</span>
        </div>
      )}
      {chart.published_by_name && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Published by</span>
          <span>{chart.published_by_name}</span>
        </div>
      )}
    </div>
    <div className="space-y-2">
      <Button
        variant="outline"
        onClick={onValidate}
        disabled={!draft || draftLoading || validatePending}
      >
        {validatePending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Check className="mr-2 h-4 w-4" />
        )}
        Validate draft
      </Button>
      {validation && (
        <div
          className={`rounded-lg border p-3 text-sm ${validation.is_valid ? "border-green-600 bg-green-50" : "border-destructive bg-destructive/5"}`}
        >
          {validation.is_valid ? (
            <p className="flex items-center gap-2 text-green-700">
              <Check className="h-4 w-4" /> Draft is valid and can be published.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-destructive">
                <XCircle className="h-4 w-4" /> Validation failed. Fix the draft before publishing.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-destructive">
                {validation.errors.slice(0, 5).map((error, idx) => (
                  <li key={idx}>
                    {error.field}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
    {chart.status !== "published" && (
      <div className="space-y-2">
        <Label htmlFor="change-summary">Change summary (optional)</Label>
        <Input
          id="change-summary"
          placeholder="e.g. Added Q4 engineering team..."
          value={changeSummary}
          onChange={(e) => onChangeSummary(e.target.value)}
          maxLength={500}
        />
        <p className="text-xs text-muted-foreground">
          Shown in the revision history to help track what changed.
        </p>
      </div>
    )}
    <div className="flex flex-wrap gap-2">
      {chart.status === "published" ? (
        <Button variant="outline" onClick={onUnpublish} disabled={unpublish.isPending}>
          {unpublish.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Lock className="mr-2 h-4 w-4" />
          )}
          Unpublish
        </Button>
      ) : (
        <Button
          onClick={onPublish}
          disabled={
            publish.isPending ||
            validation?.is_valid === false ||
            !draft ||
            draft.nodes.length === 0
          }
        >
          {publish.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Rocket className="mr-2 h-4 w-4" />
          )}
          Publish now
        </Button>
      )}
      {chart.status !== "published" && draft && draft.nodes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Add at least one node to the draft before publishing.
        </p>
      )}
    </div>
    {(publish.error != null || unpublish.error != null) && (
      <div className="rounded-lg border border-destructive bg-destructive/5 p-3 text-sm text-destructive">
        <p className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {formatError(publish.error || unpublish.error)}
        </p>
      </div>
    )}
    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
      <p className="font-medium">Who gets access?</p>
      {isPublic ? (
        <p className="text-muted-foreground">{audienceLabels.all_authenticated}.</p>
      ) : audienceMode === "private_admin" ? (
        <p className="text-muted-foreground">{audienceLabels.private_admin}.</p>
      ) : audienceIsValid ? (
        <p className="text-muted-foreground">
          Users matching any of these roles ({roleCodes.join(", ") || "none"}) or any of these
          groups ({groupCount} selected).
        </p>
      ) : (
        <p className="text-muted-foreground">Choose and save a valid audience first.</p>
      )}
    </div>
  </GlassCard>
);
