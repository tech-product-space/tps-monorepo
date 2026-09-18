"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Radio, Users, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Switch } from "@/gradient/components/ui/switch";
import { Label } from "@/gradient/components/ui/label";
import AudienceSelector from "../../CampaignEditor/AudienceSelector/AudienceSelector";
import { describeSourceSelection } from "./TriggerFilters";
import TriggerSourceDialog from "./TriggerSourceDialog";
import { REALTIME_SOURCES } from "./realtimeSources";

import { campaignService } from "@/gradient/services/campaignService";
import { metaService } from "@/gradient/services/metaService";
import type { MetaFormOption } from "@/gradient/types/meta";
import type {
  AudienceSources,
  CampaignSourceType,
  RecipientFilters,
} from "@/gradient/types/campaign";
import { SOURCE_LABELS } from "@/gradient/types/campaign";
import type {
  NewActivityTriggerConfig,
  StaticListTriggerConfig,
  TriggerConfig,
  TriggerSourceClause,
  Workflow,
  WorkflowTriggerType,
} from "@/gradient/types/workflow";

interface Props {
  workflow: Workflow;
  onChange: (updates: {
    triggerType: WorkflowTriggerType;
    triggerConfig: TriggerConfig;
  }) => void;
  readOnly?: boolean;
}

/**
 * What a list trigger may be built from.
 *
 * Seven of the thirteen campaign sources, and the six left out are left out for
 * one reason: they describe something a person did **part-way through a
 * journey** — finished a course, earned a certificate, left feedback, referred
 * somebody, received a previous campaign. Those are good things to *branch* on,
 * and a poor way to *start* a sequence, because the people they select are
 * usually already being mailed by something else.
 *
 * Facebook leads belong here for the same reason website leads do: filling in a
 * lead form is the start of a journey, not a step through one.
 *
 * Campaigns still offer all thirteen. This narrows the picker, not the
 * resolver: a clause already saved against one of the excluded sources stays
 * visible and keeps working, so nothing becomes invisible-but-in-force.
 */
const LIST_TRIGGER_SOURCES: CampaignSourceType[] = [
  "leads",
  "metaLeads",
  "resourceLeads",
  "eventGuests",
  "contactLists",
  "subscribers",
  "users",
];

export default function TriggerTab({ workflow, onChange, readOnly }: Props) {
  const [audienceOpen, setAudienceOpen] = useState(false);

  /** Null = closed. `{ clause: null }` = adding; a clause = editing that one. */
  const [dialog, setDialog] = useState<{
    clause: TriggerSourceClause | null;
  } | null>(null);

  const [sources, setSources] = useState<AudienceSources | null>(null);
  const [loadingSources, setLoadingSources] = useState(false);
  const [metaForms, setMetaForms] = useState<MetaFormOption[] | null>(null);

  const type = workflow.triggerType;

  const realtime = workflow.triggerConfig as NewActivityTriggerConfig;
  const staticList = workflow.triggerConfig as StaticListTriggerConfig;

  const clauses: TriggerSourceClause[] =
    type === "newActivity" ? (realtime?.sources ?? []) : [];

  const taken = clauses.map((c) => c.type);

  /**
   * The lists behind every picker, loaded once and shared.
   *
   * Two requests, because they come from two different parts of the product:
   * events, resources, courses and website form names ride on the campaign
   * editor's `/campaigns/sources`, and Facebook forms belong to the Meta
   * integration.
   *
   * Loaded when the dialog opens **and** when the tab opens with triggers
   * already set, because the rows below name what was picked — without the
   * lists they can only say "2 forms", which is the thing that made the old
   * design unreadable.
   */
  const loadPickerData = useCallback(async () => {
    if (!sources && !loadingSources) {
      setLoadingSources(true);
      try {
        setSources(await campaignService.sources());
      } catch {
        toast.error("Could not load events, resources and courses to filter by");
      } finally {
        setLoadingSources(false);
      }
    }

    if (!metaForms) {
      try {
        setMetaForms((await metaService.listAllForms()).data ?? []);
      } catch {
        // Silent, and an empty list rather than null: Facebook may simply not
        // be connected, which is not an error worth a toast on a tab nobody
        // asked about it on.
        setMetaForms([]);
      }
    }
  }, [sources, loadingSources, metaForms]);

  const writeClauses = (next: TriggerSourceClause[]) =>
    onChange({
      triggerType: "newActivity",
      triggerConfig: { ...realtime, sources: next },
    });

  const saveClause = (clause: TriggerSourceClause) =>
    writeClauses(
      taken.includes(clause.type)
        ? clauses.map((c) => (c.type === clause.type ? clause : c))
        : [...clauses, clause],
    );

  // Its filters go with it. Keeping them for a source nobody is watching is how
  // a removed trigger comes back later with a filter it never had.
  const removeClause = (source: CampaignSourceType) =>
    writeClauses(clauses.filter((c) => c.type !== source));

  const openDialog = (clause: TriggerSourceClause | null) => {
    loadPickerData();
    setDialog({ clause });
  };

  /**
   * The rows below name what was picked, so the lists are needed as soon as the
   * tab opens on a workflow that already has triggers — not only when somebody
   * opens the dialog. Without this they would read "2 forms" until clicked,
   * which is the thing that made the old design unreadable.
   */
  useEffect(() => {
    if (clauses.length) loadPickerData();
  }, [clauses.length, loadPickerData]);

  return (
    <div className="space-y-5">
      {/* ── which kind ── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={readOnly}
          onClick={() =>
            onChange({
              triggerType: "newActivity",
              triggerConfig: { sources: [], allowReEnrollment: false },
            })
          }
          className={`rounded-md border p-4 text-left transition ${
            type === "newActivity"
              ? "border-primary ring-1 ring-primary"
              : "hover:border-primary/40"
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            <Radio className="h-4 w-4 text-sky-600" />
            As people arrive
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Runs by itself. Everyone who matches from now on is enrolled the
            moment they arrive.
          </p>
        </button>

        <button
          type="button"
          disabled={readOnly}
          onClick={() =>
            onChange({
              triggerType: "staticList",
              triggerConfig: {
                recipientFilters: { include: [], exclude: [] },
              },
            })
          }
          className={`rounded-md border p-4 text-left transition ${
            type === "staticList"
              ? "border-primary ring-1 ring-primary"
              : "hover:border-primary/40"
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            <Users className="h-4 w-4 text-violet-600" />
            A list, when you press Run
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick an audience the same way a campaign does, then start it by
            hand.
          </p>
        </button>
      </div>

      {/* ── realtime ── */}
      {type === "newActivity" && (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <Label>Start the journey when someone…</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Add one or more. Anybody matching any of them is enrolled.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={readOnly || taken.length >= REALTIME_SOURCES.length}
              onClick={() => openDialog(null)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add a trigger
            </Button>
          </div>

          {!clauses.length ? (
            <button
              type="button"
              disabled={readOnly}
              onClick={() => openDialog(null)}
              className="w-full rounded-md border border-dashed p-6 text-center transition hover:border-primary/50 hover:bg-muted/30 disabled:opacity-50"
            >
              <p className="text-sm font-medium">No trigger yet</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Nobody is enrolled until you add one.
              </p>
            </button>
          ) : (
            <div className="space-y-2">
              {clauses.map((clause) => {
                const option = REALTIME_SOURCES.find(
                  (o) => o.type === clause.type,
                );
                const Icon = option?.Icon ?? Users;

                return (
                  <div
                    key={clause.type}
                    className="flex items-start gap-3 rounded-md border p-3"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {SOURCE_LABELS[clause.type] ?? clause.type}
                      </div>
                      {/* Named, not counted. "2 forms" tells you a filter
                          exists; it does not tell you it is the right one, so
                          checking meant opening the picker every time. */}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {describeSourceSelection(
                          clause.type,
                          clause.filters ?? {},
                          sources,
                          metaForms,
                        )}
                      </p>
                    </div>

                    {!readOnly && (
                      <div className="flex shrink-0 items-center gap-1">
                        {option?.narrowable && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => openDialog(clause)}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Change
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${SOURCE_LABELS[clause.type]}`}
                          onClick={() => removeClause(clause.type)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Narrowing is optional everywhere — a trigger with nothing ticked
            fires on everyone from that source.
          </p>
        </div>
      )}

      {/* ── static list ── */}
      {type === "staticList" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-4">
            <div>
              <div className="text-sm font-medium">Audience</div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {staticList?.recipientFilters?.include?.length
                  ? `${staticList.recipientFilters.include.length} source${
                      staticList.recipientFilters.include.length === 1 ? "" : "s"
                    } selected`
                  : "Nothing selected yet"}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setAudienceOpen(true)}
              disabled={readOnly}
            >
              {staticList?.recipientFilters?.include?.length ? "Change" : "Choose"}
            </Button>
          </div>

          {/* The campaign editor's own selector, unchanged — same twelve
              resolvers, same stored shape. A workflow's static-list audience
              *is* a campaign audience. */}
          <AudienceSelector
            open={audienceOpen}
            onOpenChange={setAudienceOpen}
            value={
              staticList?.recipientFilters ?? { include: [], exclude: [] }
            }
            allowedSources={LIST_TRIGGER_SOURCES}
            onSave={async (filters: RecipientFilters) => {
              onChange({
                triggerType: "staticList",
                triggerConfig: { ...staticList, recipientFilters: filters },
              });
            }}
            readOnly={readOnly}
          />
        </div>
      )}

      {/* Mounted per open, keyed by what it is editing: a fresh component
          every time means it can seed its draft on mount and never has to sync
          props into state. */}
      {dialog && (
        <TriggerSourceDialog
          key={dialog.clause?.type ?? "__new"}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          editing={dialog.clause}
          taken={taken}
          options={REALTIME_SOURCES}
          sources={sources}
          metaForms={metaForms}
          loadingSources={loadingSources}
          onSave={saveClause}
        />
      )}

      {/* ── shared ── */}
      {type && (
        <div className="flex items-start gap-3 rounded-md border p-4">
          <Switch
            checked={Boolean(
              (workflow.triggerConfig as { allowReEnrollment?: boolean })
                ?.allowReEnrollment,
            )}
            onCheckedChange={(allowReEnrollment) =>
              onChange({
                triggerType: type,
                triggerConfig: { ...workflow.triggerConfig, allowReEnrollment },
              })
            }
            disabled={readOnly}
          />
          <div>
            <div className="text-sm font-medium">Let people go through twice</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Off by default. With it off, anyone who has already finished this
              workflow is skipped rather than sent the whole sequence again.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
