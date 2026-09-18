"use client";

import { useState } from "react";
import { ArrowLeft, Check } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Button } from "@/gradient/components/ui/button";

import TriggerFilters, { describeSourceSelection } from "./TriggerFilters";
import type { AudienceSources, CampaignSourceType } from "@/gradient/types/campaign";
import { SOURCE_LABELS } from "@/gradient/types/campaign";
import type { MetaFormOption } from "@/gradient/types/meta";
import type { TriggerSourceClause } from "@/gradient/types/workflow";
import type { RealtimeSource } from "./realtimeSources";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null when adding; the existing clause when editing one. */
  editing: TriggerSourceClause | null;
  /** Sources already chosen, so the picker cannot offer a duplicate. */
  taken: CampaignSourceType[];
  options: RealtimeSource[];
  sources: AudienceSources | null;
  metaForms: MetaFormOption[] | null;
  loadingSources?: boolean;
  onSave: (clause: TriggerSourceClause) => void;
}

/**
 * Choosing what starts a journey, in one place.
 *
 * This used to be a grid of tickboxes with a "Narrow" arrow that expanded a
 * panel inside a two-column grid. Two problems, and they compounded: the panel
 * was cramped enough that a list of thirty events was unusable, and because
 * ticking the box and narrowing it were separate acts, the common case — "start
 * when somebody fills *this* form" — read as an afterthought to "start when
 * somebody fills any form". The dangerous default was the easy one.
 *
 * As a dialog, picking the source and saying which ones is a single motion,
 * with room to actually read the list. Everything is local until Save, so
 * backing out changes nothing — the same contract the audience selector and the
 * step panel make.
 */
export default function TriggerSourceDialog({
  open,
  onOpenChange,
  editing,
  taken,
  options,
  sources,
  metaForms,
  loadingSources,
  onSave,
}: Props) {
  /**
   * Seeded once, on mount.
   *
   * The parent mounts this only while it is open and gives it a `key`, so every
   * open is a fresh component and there is nothing to reset. Syncing props into
   * state with an effect instead would mean a render where the dialog is open
   * and still showing the *previous* trigger's picks.
   */
  const [source, setSource] = useState<CampaignSourceType | null>(
    editing?.type ?? null,
  );
  const [filters, setFilters] = useState<Record<string, unknown>>(
    editing?.filters ?? {},
  );

  const chosen = options.find((o) => o.type === source);

  const save = () => {
    if (!source) return;
    onSave({ type: source, filters });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>
            {chosen ? SOURCE_LABELS[chosen.type] : "Start the journey when…"}
          </DialogTitle>
          <DialogDescription>
            {chosen
              ? chosen.question
              : "Pick what somebody has to do to be enrolled."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {!source ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map(({ type, Icon, hint }) => {
                // An already-chosen source is shown, disabled, rather than
                // hidden — a list that silently shortens as you use it is
                // harder to trust than one that says why.
                const already = taken.includes(type) && editing?.type !== type;

                return (
                  <button
                    key={type}
                    type="button"
                    disabled={already}
                    onClick={() => setSource(type)}
                    className="rounded-md border p-3 text-left transition enabled:hover:border-primary/50 enabled:hover:bg-muted/40 disabled:opacity-45"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {SOURCE_LABELS[type] ?? type}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {already ? "Already a trigger" : hint}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {chosen?.narrowable ? (
                <TriggerFilters
                  source={source}
                  filters={filters}
                  sources={sources}
                  metaForms={metaForms}
                  loading={loadingSources}
                  onChange={setFilters}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  There is nothing to narrow here — an account is an account.
                  Everyone who signs up starts this journey.
                </p>
              )}

              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Will fire on: </span>
                <span className="font-medium">
                  {describeSourceSelection(source, filters, sources, metaForms)}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row justify-between gap-2 border-t px-6 py-4 sm:justify-between">
          {/* Only when adding: while editing, the source is fixed — changing it
              would silently discard the filters set against the old one. */}
          {source && !editing ? (
            <Button variant="ghost" size="sm" onClick={() => setSource(null)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={!source} onClick={save}>
              <Check className="mr-1.5 h-4 w-4" />
              {editing ? "Save" : "Add trigger"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
