"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Award,
  CalendarDays,
  ChevronRight,
  FileText,
  GraduationCap,
  Loader2,
  Mail,
  Megaphone,
  MessageSquare,
  Video,
  Send,
  Share2,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/gradient/components/ui/accordion";
import { Button } from "@/gradient/components/ui/button";
import { Checkbox } from "@/gradient/components/ui/checkbox";

import { campaignService } from "@/gradient/services/campaignService";
import { metaService } from "@/gradient/services/metaService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import type {
  AudienceClause,
  AudienceSources,
  CampaignSourceType,
  RecipientFilters,
} from "@/gradient/types/campaign";
import type { MetaLeadFilters as MetaFilterOptions } from "@/gradient/types/meta";

import LeadFilters from "./filters/LeadFilters";
import MetaLeadFilters from "./filters/MetaLeadFilters";
import MetaLeadStep from "./filters/MetaLeadStep";
import EventStep, { type EventFilter } from "./filters/EventStep";
import ResourceStep from "./filters/ResourceStep";
import RecordingStep from "./filters/RecordingStep";
import ContactListStep from "./filters/ContactListStep";
import EventIdStep from "./filters/EventIdStep";
import CampaignStep from "./filters/CampaignStep";
import SourceFilters from "./filters/SourceFilters";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: RecipientFilters;
  onSave: (filters: RecipientFilters) => Promise<void>;
  readOnly?: boolean;
  /**
   * Narrows the list of sources on offer. Omit for all of them.
   *
   * Campaigns take every source; a workflow list trigger takes a subset,
   * because a source that describes something a person did *part-way through a
   * journey* makes a poor way to *start* one.
   *
   * A source already saved in `value` is always shown even when it is not on
   * this list, so a filter that is genuinely in force can never be invisible —
   * a stored clause nobody can see is exactly how a workflow ends up quietly
   * mailing the wrong people.
   */
  allowedSources?: CampaignSourceType[];
}

/** A drill-down source: too many options to sit inside an accordion panel. */
type StepType =
  | "eventGuests"
  | "resourceLeads"
  | "recordingLeads"
  | "contactLists"
  | "certificateHolders"
  | "eventFeedback"
  | "eventReferrers"
  | "campaignRecipients"
  | "metaLeads";

/**
 * Which key — or keys — a drill-down writes.
 *
 * Three of the event-based sources share `EventIdStep` and all write `eventId`;
 * event *registrations* is the odd one out, because it hangs a status and an
 * attendee type off each event and so writes `eventFilters` instead.
 *
 * `metaLeads` is the one that spans four keys, because Facebook's hierarchy is
 * four levels and any of them may be picked. The count sums them: reading only
 * the first would badge "0 selected" for somebody who narrowed by ad set.
 */
const STEP_KEY: Record<StepType, string | string[]> = {
  eventGuests: "eventFilters",
  resourceLeads: "resourceId",
  recordingLeads: "recordingId",
  contactLists: "contactListId",
  certificateHolders: "eventId",
  eventFeedback: "eventId",
  eventReferrers: "eventId",
  campaignRecipients: "campaignId",
  metaLeads: ["formId", "campaignId", "adsetId", "adId"],
};

const SOURCES: {
  type: CampaignSourceType;
  label: string;
  description: string;
  step?: StepType;
  icon?: typeof Users;
  stepLabel?: string;
  noun?: string;
}[] = [
  {
    type: "leads",
    label: "Website Leads",
    description: "Enquiries, brochure downloads and callback requests",
  },
  {
    type: "metaLeads",
    label: "Facebook Lead Forms",
    description: "People who filled in a Facebook lead ad form",
    step: "metaLeads",
    icon: Megaphone,
    stepLabel: "Narrow by form, campaign or ad",
    noun: "selection",
  },
  {
    type: "resourceLeads",
    label: "Resource Leads",
    description: "People who downloaded a resource",
    step: "resourceLeads",
    icon: FileText,
    stepLabel: "Select resources",
    noun: "resource",
  },
  {
    type: "recordingLeads",
    label: "Recording Signups",
    description: "People who passed a session recording's email gate",
    step: "recordingLeads",
    icon: Video,
    stepLabel: "Select recordings",
    noun: "recording",
  },
  {
    type: "eventGuests",
    label: "Event Leads",
    description: "People who registered for an event",
    step: "eventGuests",
    icon: CalendarDays,
    stepLabel: "Select events",
    noun: "event",
  },
  {
    type: "contactLists",
    label: "Contact Lists",
    description: "CSV lists uploaded under Contacts",
    step: "contactLists",
    icon: Users,
    stepLabel: "Select contact lists",
    noun: "list",
  },
  {
    type: "subscribers",
    label: "Newsletter Subscribers",
    description: "People who asked for the newsletter",
  },
  {
    type: "users",
    label: "Registered Users",
    description: "Accounts on the site",
  },
  {
    type: "freeCourseEnrolments",
    label: "Free Course Enrolments",
    description: "People who signed up for a free course",
  },
  {
    type: "freeCourseProgress",
    label: "Free Course Progress",
    description: "By how far through a course they actually got",
  },
  {
    type: "certificateHolders",
    label: "Certificate Holders",
    description: "People issued a certificate for an event",
    step: "certificateHolders",
    icon: Award,
    stepLabel: "Select events",
    noun: "event",
  },
  {
    type: "eventFeedback",
    label: "Event Feedback",
    description: "Guests who were asked for feedback",
    step: "eventFeedback",
    icon: MessageSquare,
    stepLabel: "Select events",
    noun: "event",
  },
  {
    type: "eventReferrers",
    label: "Event Referrers",
    description: "People who brought others to an event",
    step: "eventReferrers",
    icon: Share2,
    stepLabel: "Select events",
    noun: "event",
  },
  {
    type: "campaignRecipients",
    label: "A Previous Campaign",
    description: "Everyone a past campaign reached",
    step: "campaignRecipients",
    icon: Send,
    stepLabel: "Select campaigns",
    noun: "campaign",
  },
];

/**
 * Withdrawn from the picker.
 *
 * The backend still resolves every one of them and their filter UI is still
 * here — this hides them from the list of things you can newly turn on, it
 * does not delete the capability. A campaign or automation that already uses
 * one keeps working, and `visibleSources` still shows it, because a clause
 * that is in force but invisible is how a send quietly reaches the wrong
 * people.
 *
 * Put a type back on the list by deleting it from here.
 */
const RETIRED_SOURCES: CampaignSourceType[] = [
  "freeCourseProgress",
  "certificateHolders",
  "eventFeedback",
  "eventReferrers",
  "campaignRecipients",
];

/** Icons for the sources with no drill-down, so the list scans evenly. */
const SOURCE_ICONS: Partial<Record<CampaignSourceType, typeof Users>> = {
  leads: FileText,
  subscribers: Mail,
  users: UserCheck,
  freeCourseEnrolments: GraduationCap,
  freeCourseProgress: GraduationCap,
};

const STEP_TITLES: Record<StepType, string> = {
  metaLeads: "Facebook Lead Forms",
  eventGuests: "Event Leads",
  resourceLeads: "Resource Leads",
  recordingLeads: "Recording Signups",
  contactLists: "Contact Lists",
  certificateHolders: "Certificate Holders",
  eventFeedback: "Event Feedback",
  eventReferrers: "Event Referrers",
  campaignRecipients: "A Previous Campaign",
};

/**
 * Picks the audience.
 *
 * Two levels, following the pattern the team already knows from TPS: a list of
 * sources you tick, and — for the three that are a long list of things rather
 * than a handful of filters — a full-pane picker you step into and back out of.
 * Cramming a searchable list of 200 resources inside an accordion panel is what
 * this replaces.
 *
 * There is no exclude side. `recipientFilters` is still stored as
 * `{ include, exclude }` because the column is JSONB on every campaign row and
 * the send job reads both halves, so `exclude` is preserved as found rather
 * than dropped — campaigns saved before this change keep working.
 *
 * Everything is local until Apply, so backing out changes nothing.
 */
export default function AudienceSelector({
  open,
  onOpenChange,
  value,
  onSave,
  readOnly = false,
  allowedSources,
}: Props) {
  const [clauses, setClauses] = useState<AudienceClause[]>([]);
  const [sources, setSources] = useState<AudienceSources | null>(null);
  const [openItems, setOpenItems] = useState<string[]>([]);
  const [step, setStep] = useState<StepType | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Facebook's own vocabulary, from the Meta integration rather than from
  // `/campaigns/sources`. Fetched separately and lazily — see `loadMetaFilters`.
  const [metaOptions, setMetaOptions] = useState<MetaFilterOptions | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);

  // Re-seed on every open: local edits from a cancelled session must not
  // survive into the next one.
  useEffect(() => {
    if (!open) return;

    setClauses(value?.include ?? []);
    // Every panel closed, whatever is already selected. Expanding the saved
    // sources meant the dialog opened onto a wall of lead-source checkboxes,
    // and the four sources are the thing you came here to choose between.
    setOpenItems([]);
    setStep(null);

    // Seeded once per open, deliberately not on `value`: the parent passes a
    // fresh object literal when a campaign has no saved filters, so tracking it
    // would reset the panel mid-edit on any re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || sources) return;

    setLoading(true);
    campaignService
      .sources()
      .then(setSources)
      .catch((error) =>
        toast.error(
          getApiErrorMessage(error, "Failed to load audience options"),
        ),
      )
      .finally(() => setLoading(false));
  }, [open, sources]);

  /**
   * Facebook's forms, campaigns, ad sets, ads and routing vocabulary.
   *
   * Deliberately **not** part of the load above. `/meta/leads/filters` runs six
   * aggregates over `meta_leads`, and most campaigns never touch Facebook — so
   * it is paid for the first time somebody opens this source, not on every
   * dialog open.
   *
   * A failure leaves an empty options object rather than raising a toast:
   * Facebook may simply not be connected, which is a sentence the step already
   * says, not an error worth interrupting the dialog for.
   */
  const loadMetaFilters = useCallback(async () => {
    if (metaOptions || loadingMeta) return;

    setLoadingMeta(true);
    try {
      setMetaOptions((await metaService.getFilters()).data);
    } catch {
      setMetaOptions({
        accounts: [],
        forms: [],
        campaigns: [],
        adsets: [],
        ads: [],
        sources: [],
      });
    } finally {
      setLoadingMeta(false);
    }
  }, [metaOptions, loadingMeta]);

  // Also on reopen with a Facebook clause already saved: the accordion badge
  // and the chips name what was picked, and without the lists they can only
  // say "3 selected".
  useEffect(() => {
    if (!open) return;
    if (!(value?.include ?? []).some((c) => c.type === "metaLeads")) return;

    loadMetaFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * What this caller is allowed to offer, plus anything already saved.
   *
   * The union is the important half — see `allowedSources`.
   */
  const visibleSources = SOURCES.filter((source) => {
    // Already saved beats every rule below it — see `RETIRED_SOURCES` and
    // `allowedSources`. Both hide a source; neither may hide one in force.
    if (clauses.some((c) => c.type === source.type)) return true;
    if (RETIRED_SOURCES.includes(source.type)) return false;

    return !allowedSources || allowedSources.includes(source.type);
  });

  const clauseFor = (type: CampaignSourceType) =>
    clauses.find((c) => c.type === type);

  const filtersFor = (type: CampaignSourceType) =>
    (clauseFor(type)?.filters || {}) as Record<string, unknown>;

  const toggleSource = (type: CampaignSourceType) => {
    if (clauseFor(type)) {
      setClauses(clauses.filter((c) => c.type !== type));
      setOpenItems((prev) => prev.filter((i) => i !== type));
    } else {
      setClauses([...clauses, { type, filters: {} }]);
      setOpenItems((prev) => [...prev, type]);
      if (type === "metaLeads") loadMetaFilters();
    }
  };

  /** Writes a source's filters, adding the source if a step set one first. */
  const patchFilters = (
    type: CampaignSourceType,
    next: Record<string, unknown>,
  ) =>
    setClauses((prev) =>
      prev.some((c) => c.type === type)
        ? prev.map((c) => (c.type === type ? { ...c, filters: next } : c))
        : [...prev, { type, filters: next }],
    );

  /** How many things are picked inside a drill-down, for the badge. */
  const stepCount = (step: StepType, type: CampaignSourceType) => {
    const f = filtersFor(type);
    const key = STEP_KEY[step];

    // Registrations store a map keyed by event id, everything else a plain
    // array. Driven off `STEP_KEY` so adding a source cannot forget this.
    if (key === "eventFilters") {
      return Object.keys((f.eventFilters || {}) as object).length;
    }

    // A step may span several keys — Facebook's four hierarchy levels — in
    // which case the badge is their total.
    return (Array.isArray(key) ? key : [key]).reduce(
      (total, k) => total + (Array.isArray(f[k]) ? (f[k] as string[]).length : 0),
      0,
    );
  };

  const handleApply = async () => {
    setSaving(true);
    try {
      await onSave({ include: clauses, exclude: value?.exclude ?? [] });
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to save the audience"));
    } finally {
      setSaving(false);
    }
  };

  const title = step
    ? STEP_TITLES[step]
    : readOnly
      ? "Recipients (view only)"
      : "Select lead source";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] w-full flex-col sm:max-w-4xl!">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p className="text-muted-foreground text-sm">
            {step
              ? "Pick the ones to include. Anyone who has unsubscribed is removed automatically."
              : "Turn on the sources this campaign should reach, then narrow each one down. Anyone matched by more than one is still mailed once."}
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-2">
          {loading && !sources ? (
            <div className="flex justify-center py-16">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </div>
          ) : step === "metaLeads" ? (
            // Ahead of the `!sources` guard: Facebook's lists come from the
            // Meta integration, so this step must work whether or not
            // `/campaigns/sources` has arrived.
            <MetaLeadStep
              options={metaOptions}
              loading={loadingMeta}
              filters={filtersFor("metaLeads")}
              disabled={readOnly}
              onChange={(next) => patchFilters("metaLeads", next)}
            />
          ) : !sources ? null : step === "eventGuests" ? (
            <EventStep
              sources={sources}
              disabled={readOnly}
              eventFilters={
                (filtersFor("eventGuests").eventFilters || {}) as Record<
                  string,
                  EventFilter
                >
              }
              onChange={(eventFilters) =>
                patchFilters("eventGuests", {
                  ...filtersFor("eventGuests"),
                  eventFilters,
                })
              }
            />
          ) : step === "resourceLeads" ? (
            <ResourceStep
              sources={sources}
              disabled={readOnly}
              selectedIds={
                (filtersFor("resourceLeads").resourceId || []) as string[]
              }
              onChange={(resourceId) =>
                patchFilters("resourceLeads", {
                  ...filtersFor("resourceLeads"),
                  resourceId,
                })
              }
            />
          ) : step === "recordingLeads" ? (
            <RecordingStep
              sources={sources}
              disabled={readOnly}
              selectedIds={
                (filtersFor("recordingLeads").recordingId || []) as string[]
              }
              onChange={(recordingId) =>
                patchFilters("recordingLeads", {
                  ...filtersFor("recordingLeads"),
                  recordingId,
                })
              }
            />
          ) : step === "contactLists" ? (
            <ContactListStep
              sources={sources}
              disabled={readOnly}
              selectedIds={
                (filtersFor("contactLists").contactListId || []) as string[]
              }
              onChange={(contactListId) =>
                patchFilters("contactLists", { contactListId })
              }
            />
          ) : step === "campaignRecipients" ? (
            <CampaignStep
              sources={sources}
              disabled={readOnly}
              selectedIds={
                (filtersFor("campaignRecipients").campaignId || []) as string[]
              }
              onChange={(campaignId) =>
                patchFilters("campaignRecipients", {
                  ...filtersFor("campaignRecipients"),
                  campaignId,
                })
              }
            />
          ) : step === "certificateHolders" ||
            step === "eventFeedback" ||
            step === "eventReferrers" ? (
            // One picker, three sources. They differ in what they do with the
            // events, not in how the events are chosen.
            <EventIdStep
              sources={sources}
              disabled={readOnly}
              selectedIds={(filtersFor(step).eventId || []) as string[]}
              onChange={(eventId) =>
                patchFilters(step, { ...filtersFor(step), eventId })
              }
            />
          ) : (
            <Accordion
              type="multiple"
              value={openItems}
              onValueChange={(next) => {
                // Expanding Facebook is the moment its lists are worth paying
                // for, and the first place they are shown.
                if (next.includes("metaLeads")) loadMetaFilters();
                setOpenItems(next);
              }}
              className="w-full"
            >
              {visibleSources.map((source) => {
                const selected = Boolean(clauseFor(source.type));
                const count = source.step
                  ? stepCount(source.step, source.type)
                  : 0;
                const Icon = source.icon ?? SOURCE_ICONS[source.type];

                return (
                  <AccordionItem key={source.type} value={source.type}>
                    <div
                      className={`flex items-center gap-3 rounded-md px-3 ${
                        selected ? "bg-muted/40" : ""
                      }`}
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleSource(source.type)}
                        disabled={readOnly}
                      />
                      <AccordionTrigger className="flex-1 py-3 text-left">
                        <div>
                          <p className="text-sm font-semibold">
                            {source.label}
                          </p>
                          <p className="text-muted-foreground text-xs font-normal">
                            {source.description}
                          </p>
                        </div>
                      </AccordionTrigger>
                    </div>

                    <AccordionContent className="px-3 pb-4">
                      {!selected ? (
                        <p className="text-muted-foreground px-1 py-3 text-sm">
                          Turn this source on to narrow it down.
                        </p>
                      ) : (
                        <div className="space-y-4">
                          {source.step && (
                            <button
                              type="button"
                              onClick={() => setStep(source.step!)}
                              className="border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/40 group flex w-full items-center justify-between rounded-lg border border-dashed px-4 py-3 transition-all"
                            >
                              <span className="flex items-center gap-2">
                                {Icon && (
                                  <Icon className="text-muted-foreground group-hover:text-primary h-4 w-4 transition-colors" />
                                )}
                                <span className="group-hover:text-primary text-sm font-medium transition-colors">
                                  {source.stepLabel}
                                </span>
                                {count > 0 ? (
                                  <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                                    {count} {source.noun}
                                    {count === 1 ? "" : "s"} selected
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-xs">
                                    Click to choose
                                  </span>
                                )}
                              </span>
                              <ChevronRight className="text-muted-foreground group-hover:text-primary h-4 w-4 transition-colors" />
                            </button>
                          )}

                          {/* A drill-down and inline switches are not exclusive:
                            certificate holders pick events *and* a status, and
                            feedback picks events *and* whether they replied. */}
                          {source.type === "leads" ? (
                            <LeadFilters
                              sources={sources}
                              disabled={readOnly}
                              filters={filtersFor(source.type)}
                              onChange={(next) =>
                                patchFilters(source.type, next)
                              }
                            />
                          ) : source.type === "metaLeads" ? (
                            <MetaLeadFilters
                              options={metaOptions}
                              loading={loadingMeta}
                              disabled={readOnly}
                              filters={filtersFor(source.type)}
                              onChange={(next) =>
                                patchFilters(source.type, next)
                              }
                            />
                          ) : (
                            <SourceFilters
                              type={source.type}
                              sources={sources}
                              disabled={readOnly}
                              filters={filtersFor(source.type)}
                              onChange={(next) =>
                                patchFilters(source.type, next)
                              }
                            />
                          )}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </div>

        <DialogFooter>
          {step && (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={() => setStep(null)}
            >
              ← Back
            </Button>
          )}

          {readOnly ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleApply} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Apply
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
