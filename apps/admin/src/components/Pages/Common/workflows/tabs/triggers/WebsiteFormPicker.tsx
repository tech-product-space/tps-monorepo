"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  Loader2,
  FileText,
  Calendar,
  BookOpen,
  UserPlus,
  Search,
  Users,
  Megaphone,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import type { RecipientFilter } from "@/types/workflow";
import { campaignService } from "@/services/campaign/campaignService";
import {
  externalLeadService,
  type MetaFormOption,
} from "@/services/Leads/externalLeadService";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  groupFormsByCategory,
  KNOWN_FORM_TYPES,
} from "../../data/leadFormCatalog";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value?: RecipientFilter;
  onChange: (next: RecipientFilter) => Promise<void> | void;
  /** When true the picker renders as a view-only summary — all interactive
   *  controls are disabled and the Save / Clear-all buttons are hidden. */
  readOnly?: boolean;
};

type EventOption = {
  id: number;
  title: string;
  eventType?: string;
  eventCategory?: string;
  totalGuests?: number;
};
type ResourceOption = {
  id: number;
  title: string;
  resourceType?: string;
  resourceCategory?: string;
  leadCount?: number;
};

/**
 * Decode the existing recipient_filter back into checkbox state.
 * Form types that are no longer in the catalog are dropped — they'll
 * disappear from the saved config on the next Save.
 *
 * Events/Resources support a wildcard mode: when the source entry exists
 * but its filters object has no eventFilters/resourceFilters key (or it's
 * an empty object), the matcher fires for any event/resource ever. We
 * surface that as the `eventsAny` / `resourcesAny` flag.
 */
function decode(value?: RecipientFilter) {
  const out = {
    formTypes: new Set<string>(),
    eventIds: new Set<number>(),
    resourceIds: new Set<number>(),
    metaFormIds: new Set<string>(),
    eventsAny: false,
    resourcesAny: false,
    metaAny: false,
    userSignups: false,
  };
  if (!value?.sources?.length) return out;
  for (const s of value.sources) {
    if (s.type === "platform_leads") {
      const f: any = s.filters || {};
      for (const p of f.programs || []) {
        for (const t of p.types || []) {
          if (KNOWN_FORM_TYPES.has(t)) out.formTypes.add(t);
        }
      }
    } else if (s.type === "events") {
      const f: any = s.filters || {};
      const ef = f.eventFilters;
      if (!ef || Object.keys(ef).length === 0) {
        out.eventsAny = true;
      } else {
        for (const k of Object.keys(ef)) {
          out.eventIds.add(Number(k));
        }
      }
    } else if (s.type === "resources") {
      const f: any = s.filters || {};
      const rf = f.resourceFilters;
      if (!rf || Object.keys(rf).length === 0) {
        out.resourcesAny = true;
      } else {
        for (const k of Object.keys(rf)) {
          out.resourceIds.add(Number(k));
        }
      }
    } else if (s.type === "external_leads") {
      const f: any = s.filters || {};
      const metaSources = (f.sources || []).filter(
        (ms: any) => !ms.source || ms.source === "meta"
      );
      if (metaSources.length === 0 && Object.keys(f).length === 0) {
        // Bare external_leads entry with no filter — treat as wildcard.
        out.metaAny = true;
      }
      for (const ms of metaSources) {
        if (Array.isArray(ms.form_ids) && ms.form_ids.length > 0) {
          for (const id of ms.form_ids) out.metaFormIds.add(String(id));
        } else {
          out.metaAny = true;
        }
      }
    } else if (s.type === "users") {
      out.userSignups = true;
    }
  }
  return out;
}

/**
 * Encode checkbox state back into a recipient_filter compatible with the
 * matchers + resolvers.
 */
function encode(state: {
  formTypes: Set<string>;
  eventIds: Set<number>;
  resourceIds: Set<number>;
  metaFormIds: Set<string>;
  eventsAny: boolean;
  resourcesAny: boolean;
  metaAny: boolean;
  userSignups: boolean;
}): RecipientFilter {
  const sources: RecipientFilter["sources"] = [];

  if (state.formTypes.size > 0) {
    sources.push({
      type: "platform_leads",
      filters: { programs: [{ types: [...state.formTypes] }] },
    });
  }

  if (state.eventsAny) {
    // Wildcard — matcher fires for any event registration, current or future.
    sources.push({ type: "events", filters: {} });
  } else if (state.eventIds.size > 0) {
    const eventFilters: Record<number, any> = {};
    for (const id of state.eventIds) {
      eventFilters[id] = { targetGuestRole: "All", targetGuestType: "All" };
    }
    sources.push({
      type: "events",
      filters: { eventFilters },
    });
  }

  if (state.resourcesAny) {
    sources.push({ type: "resources", filters: {} });
  } else if (state.resourceIds.size > 0) {
    const resourceFilters: Record<number, any> = {};
    for (const id of state.resourceIds) {
      resourceFilters[id] = { targetRoles: [] };
    }
    sources.push({
      type: "resources",
      filters: { resourceFilters },
    });
  }

  if (state.metaAny) {
    // Wildcard — any Meta lead, from any form, current or future.
    sources.push({
      type: "external_leads",
      filters: { sources: [{ source: "meta" }] },
    });
  } else if (state.metaFormIds.size > 0) {
    sources.push({
      type: "external_leads",
      filters: {
        sources: [{ source: "meta", form_ids: [...state.metaFormIds] }],
      },
    });
  }

  if (state.userSignups) {
    sources.push({ type: "users", filters: {} });
  }

  return { sources };
}

export default function WebsiteFormPicker({
  open,
  onOpenChange,
  value,
  onChange,
  readOnly = false,
}: Props) {
  const initial = useMemo(() => decode(value), [value]);
  const [formTypes, setFormTypes] = useState<Set<string>>(initial.formTypes);
  const [eventIds, setEventIds] = useState<Set<number>>(initial.eventIds);
  const [resourceIds, setResourceIds] = useState<Set<number>>(
    initial.resourceIds
  );
  const [metaFormIds, setMetaFormIds] = useState<Set<string>>(
    initial.metaFormIds
  );
  const [eventsAny, setEventsAny] = useState<boolean>(initial.eventsAny);
  const [resourcesAny, setResourcesAny] = useState<boolean>(
    initial.resourcesAny
  );
  const [metaAny, setMetaAny] = useState<boolean>(initial.metaAny);
  const [userSignups, setUserSignups] = useState<boolean>(initial.userSignups);
  const [saving, setSaving] = useState(false);

  const [events, setEvents] = useState<EventOption[]>([]);
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [metaForms, setMetaForms] = useState<MetaFormOption[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [metaFormsLoading, setMetaFormsLoading] = useState(false);

  // Search + filter UI state for events
  const [eventsSearch, setEventsSearch] = useState("");
  const [eventsShowSelectedOnly, setEventsShowSelectedOnly] = useState(false);

  // Search + filter UI state for resources
  const [resourcesSearch, setResourcesSearch] = useState("");
  const [resourcesShowSelectedOnly, setResourcesShowSelectedOnly] = useState(false);

  // Search UI state for meta forms
  const [metaSearch, setMetaSearch] = useState("");
  const [metaShowSelectedOnly, setMetaShowSelectedOnly] = useState(false);

  // Sync state when dialog reopens with a fresh value
  useEffect(() => {
    if (open) {
      const d = decode(value);
      setFormTypes(new Set(d.formTypes));
      setEventIds(new Set(d.eventIds));
      setResourceIds(new Set(d.resourceIds));
      setMetaFormIds(new Set(d.metaFormIds));
      setEventsAny(d.eventsAny);
      setResourcesAny(d.resourcesAny);
      setMetaAny(d.metaAny);
      setUserSignups(d.userSignups);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Lazy-load events + resources
  useEffect(() => {
    if (!open) return;
    if (events.length === 0 && !eventsLoading) {
      setEventsLoading(true);
      campaignService
        .getCampaignEvents()
        .then((r: any) =>
          setEvents(
            (r.events || []).map((e: any) => ({
              id: e.id,
              title: e.eventTitle || e.title || e.name || `Event ${e.id}`,
              eventType: e.eventType,
              eventCategory: e.eventCategory,
              totalGuests: parseInt(e.totalGuests || "0", 10) || 0,
            }))
          )
        )
        .catch(() => setEvents([]))
        .finally(() => setEventsLoading(false));
    }
    if (resources.length === 0 && !resourcesLoading) {
      setResourcesLoading(true);
      campaignService
        .getCampaignResources()
        .then((r: any) => {
          const list = r.data || r.resources || (Array.isArray(r) ? r : []);
          setResources(
            (Array.isArray(list) ? list : []).map((x: any) => ({
              id: x.id,
              title: x.title || x.name || `Resource ${x.id}`,
              resourceType: x.resourceType,
              resourceCategory: x.resourceCategory,
              leadCount: parseInt(x.leadCount || "0", 10) || 0,
            }))
          );
        })
        .catch(() => setResources([]))
        .finally(() => setResourcesLoading(false));
    }
    if (metaForms.length === 0 && !metaFormsLoading) {
      setMetaFormsLoading(true);
      externalLeadService
        .getAllMetaForms()
        .then((r) => setMetaForms(r.forms || []))
        .catch(() => setMetaForms([]))
        .finally(() => setMetaFormsLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleForm = (type: string) => {
    setFormTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleEvent = (id: number) => {
    // Ticking an individual event drops out of wildcard mode.
    setEventsAny(false);
    setEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleResource = (id: number) => {
    setResourcesAny(false);
    setResourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleMetaForm = (formId: string) => {
    setMetaAny(false);
    setMetaFormIds((prev) => {
      const next = new Set(prev);
      if (next.has(formId)) next.delete(formId);
      else next.add(formId);
      return next;
    });
  };

  const toggleAllMetaForms = () => {
    setMetaAny((prev) => {
      const next = !prev;
      if (next) setMetaFormIds(new Set()); // mode switch clears individual list
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onChange(
        encode({
          formTypes,
          eventIds,
          resourceIds,
          metaFormIds,
          eventsAny,
          resourcesAny,
          metaAny,
          userSignups,
        })
      );
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const grouped = groupFormsByCategory();
  const totalSelected =
    formTypes.size +
    (eventsAny ? 1 : eventIds.size) +
    (resourcesAny ? 1 : resourceIds.size) +
    (metaAny ? 1 : metaFormIds.size) +
    (userSignups ? 1 : 0);

  // Leads "Any" — tri-state-aware snapshot of the catalog. Selecting all
  // means saved state explicitly contains every catalog type; if a new
  // catalog entry is added later it is NOT auto-included.
  const allFormsChecked =
    KNOWN_FORM_TYPES.size > 0 &&
    [...KNOWN_FORM_TYPES].every((t) => formTypes.has(t));
  const someFormsChecked = formTypes.size > 0 && !allFormsChecked;
  const formsTriState: boolean | "indeterminate" = allFormsChecked
    ? true
    : someFormsChecked
      ? "indeterminate"
      : false;

  // Events / Resources "Any" — true wildcard. Saving fires a workflow on
  // any event/resource ever, including ones created in the future. Mutually
  // exclusive with the individual-list mode below.
  const toggleAllForms = () => {
    setFormTypes(allFormsChecked ? new Set() : new Set(KNOWN_FORM_TYPES));
  };
  const toggleAllEvents = () => {
    setEventsAny((prev) => {
      const next = !prev;
      if (next) setEventIds(new Set()); // mode switch clears individual list
      return next;
    });
  };
  const toggleAllResources = () => {
    setResourcesAny((prev) => {
      const next = !prev;
      if (next) setResourceIds(new Set());
      return next;
    });
  };

  const clearAll = () => {
    setFormTypes(new Set());
    setEventIds(new Set());
    setResourceIds(new Set());
    setMetaFormIds(new Set());
    setEventsAny(false);
    setResourcesAny(false);
    setMetaAny(false);
    setUserSignups(false);
  };

  const filteredEvents = useMemo(() => {
    const q = eventsSearch.trim().toLowerCase();
    return events
      .filter((e) => {
        if (eventsShowSelectedOnly && !eventIds.has(e.id)) return false;
        if (q) {
          const hay = `${e.title} ${e.eventType ?? ""} ${e.eventCategory ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aSel = eventIds.has(a.id);
        const bSel = eventIds.has(b.id);
        if (aSel === bSel) return 0;
        return aSel ? -1 : 1;
      });
  }, [events, eventsSearch, eventsShowSelectedOnly, eventIds]);

  const filteredResources = useMemo(() => {
    const q = resourcesSearch.trim().toLowerCase();
    return resources
      .filter((r) => {
        if (resourcesShowSelectedOnly && !resourceIds.has(r.id)) return false;
        if (q) {
          const hay = `${r.title} ${r.resourceType ?? ""} ${r.resourceCategory ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aSel = resourceIds.has(a.id);
        const bSel = resourceIds.has(b.id);
        if (aSel === bSel) return 0;
        return aSel ? -1 : 1;
      });
  }, [resources, resourcesSearch, resourcesShowSelectedOnly, resourceIds]);

  const filteredMetaForms = useMemo(() => {
    const q = metaSearch.trim().toLowerCase();
    return metaForms
      .filter((f) => {
        if (metaShowSelectedOnly && !metaFormIds.has(f.form_id)) return false;
        if (q) {
          const typeNames = (f.leadTypes || []).map((t) => t.name).join(" ");
          const hay =
            `${f.form_name ?? ""} ${f.page_name ?? ""} ${typeNames}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aSel = metaFormIds.has(a.form_id);
        const bSel = metaFormIds.has(b.form_id);
        if (aSel === bSel) return 0;
        return aSel ? -1 : 1;
      });
  }, [metaForms, metaSearch, metaShowSelectedOnly, metaFormIds]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {readOnly ? "Trigger sources (view only)" : "Pick the sources to watch"}
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? "Sources currently feeding this workflow. To change them, pause the workflow first."
              : "The workflow auto-enrolls any lead arriving from a selected source. Pick from one or many of the source types below — only items you tick will trigger this workflow; everything else is ignored."}
          </DialogDescription>
        </DialogHeader>

        <Accordion
          type="multiple"
          defaultValue={["leads", "events", "resources", "user_signup", "meta_forms"]}
          className="space-y-1"
        >
          {/* ====================================================== Leads */}
          <AccordionItem value="leads" className="border rounded-md px-3">
            <AccordionTrigger className="py-3 hover:no-underline">
              <SectionHeader
                icon={<FileText className="h-4 w-4 text-muted-foreground" />}
                title="Leads (Website forms)"
                hint="Only the form types you tick will fire"
                count={formTypes.size}
                countLabel="form"
              />
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 pl-1 pt-1 pb-2">
                <label className="flex items-center gap-3 cursor-pointer rounded p-2 border border-dashed bg-muted/30">
                  <Checkbox
                    checked={formsTriState}
                    onCheckedChange={toggleAllForms}
                    disabled={readOnly}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      Any listed form ({KNOWN_FORM_TYPES.size})
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Selects every form below — any submission of these will
                      trigger the workflow.
                    </div>
                  </div>
                </label>
                {CATEGORY_ORDER.filter(
                  (cat) => (grouped[cat] || []).length > 0
                ).map((cat) => (
                  <div key={cat}>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      {CATEGORY_LABELS[cat]}
                    </div>
                    <div className="space-y-1">
                      {grouped[cat].map((f) => (
                        <label
                          key={f.type}
                          className="flex items-start gap-3 cursor-pointer hover:bg-muted/40 rounded p-2"
                        >
                          <Checkbox
                            checked={formTypes.has(f.type)}
                            onCheckedChange={() => toggleForm(f.type)}
                            disabled={readOnly}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">
                              {f.label}
                            </div>
                            {f.description && (
                              <div className="text-xs text-muted-foreground">
                                {f.description}
                              </div>
                            )}
                            <code className="text-xs text-muted-foreground">
                              {f.type}
                            </code>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ===================================================== Events */}
          <AccordionItem value="events" className="border rounded-md px-3">
            <AccordionTrigger className="py-3 hover:no-underline">
              <SectionHeader
                icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
                title="Events"
                hint="Fires when a guest registers for a selected event"
                count={eventIds.size}
                countLabel="event"
                anyMode={eventsAny}
              />
            </AccordionTrigger>
            <AccordionContent>
              <div className="pt-1 pb-2">
                <label className="flex items-center gap-3 cursor-pointer rounded p-2 border border-dashed bg-muted/30 mb-2">
                  <Checkbox
                    checked={eventsAny}
                    onCheckedChange={toggleAllEvents}
                    disabled={readOnly}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Any event</div>
                    <div className="text-xs text-muted-foreground">
                      Fires for any event registration — including events
                      created in the future. No need to pick individual events.
                    </div>
                  </div>
                </label>
                {eventsAny ? (
                  <div className="text-sm text-muted-foreground py-6 text-center border rounded-md bg-muted/20">
                    Wildcard mode — every event registration triggers this
                    workflow. Untick <strong>Any event</strong> above to pick
                    specific events instead.
                  </div>
                ) : (
                  <>
                <div className="flex gap-2 items-center mb-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search events..."
                      value={eventsSearch}
                      onChange={(e) => setEventsSearch(e.target.value)}
                      className="pl-9 h-8 text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer whitespace-nowrap">
                    <Checkbox
                      checked={eventsShowSelectedOnly}
                      onCheckedChange={(v) =>
                        setEventsShowSelectedOnly(v === true)
                      }
                    />
                    Selected only
                  </label>
                </div>

                {eventsLoading ? (
                  <div className="flex items-center text-xs text-muted-foreground py-6 justify-center">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading
                    events…
                  </div>
                ) : filteredEvents.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-6 text-center border rounded-md">
                    {events.length === 0
                      ? "No events available"
                      : "No events match the search"}
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto border rounded-md p-2 space-y-1">
                    {filteredEvents.map((ev) => {
                      const selected = eventIds.has(ev.id);
                      return (
                        <label
                          key={ev.id}
                          className={`flex items-start gap-3 cursor-pointer rounded p-2 border transition ${
                            selected
                              ? "border-primary/40 bg-primary/5"
                              : "border-transparent hover:bg-muted/40"
                          }`}
                        >
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => toggleEvent(ev.id)}
                            disabled={readOnly}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate">
                                {ev.title}
                              </span>
                              {ev.eventType && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0 h-4"
                                >
                                  {ev.eventType}
                                </Badge>
                              )}
                              {ev.eventCategory && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0 h-4"
                                >
                                  {ev.eventCategory}
                                </Badge>
                              )}
                            </div>
                            {typeof ev.totalGuests === "number" && (
                              <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {ev.totalGuests} guest
                                {ev.totalGuests === 1 ? "" : "s"}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
                  </>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ================================================== Resources */}
          <AccordionItem value="resources" className="border rounded-md px-3">
            <AccordionTrigger className="py-3 hover:no-underline">
              <SectionHeader
                icon={<BookOpen className="h-4 w-4 text-muted-foreground" />}
                title="Resources"
                hint="Fires on download of a selected resource"
                count={resourceIds.size}
                countLabel="resource"
                anyMode={resourcesAny}
              />
            </AccordionTrigger>
            <AccordionContent>
              <div className="pt-1 pb-2">
                <label className="flex items-center gap-3 cursor-pointer rounded p-2 border border-dashed bg-muted/30 mb-2">
                  <Checkbox
                    checked={resourcesAny}
                    onCheckedChange={toggleAllResources}
                    disabled={readOnly}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Any resource</div>
                    <div className="text-xs text-muted-foreground">
                      Fires for any resource download — including resources
                      added in the future. No need to pick individual
                      resources.
                    </div>
                  </div>
                </label>
                {resourcesAny ? (
                  <div className="text-sm text-muted-foreground py-6 text-center border rounded-md bg-muted/20">
                    Wildcard mode — every resource download triggers this
                    workflow. Untick <strong>Any resource</strong> above to
                    pick specific resources instead.
                  </div>
                ) : (
                  <>
                <div className="flex gap-2 items-center mb-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search resources..."
                      value={resourcesSearch}
                      onChange={(e) => setResourcesSearch(e.target.value)}
                      className="pl-9 h-8 text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer whitespace-nowrap">
                    <Checkbox
                      checked={resourcesShowSelectedOnly}
                      onCheckedChange={(v) =>
                        setResourcesShowSelectedOnly(v === true)
                      }
                    />
                    Selected only
                  </label>
                </div>

                {resourcesLoading ? (
                  <div className="flex items-center text-xs text-muted-foreground py-6 justify-center">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading
                    resources…
                  </div>
                ) : filteredResources.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-6 text-center border rounded-md">
                    {resources.length === 0
                      ? "No resources available"
                      : "No resources match the search"}
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto border rounded-md p-2 space-y-1">
                    {filteredResources.map((r) => {
                      const selected = resourceIds.has(r.id);
                      return (
                        <label
                          key={r.id}
                          className={`flex items-start gap-3 cursor-pointer rounded p-2 border transition ${
                            selected
                              ? "border-primary/40 bg-primary/5"
                              : "border-transparent hover:bg-muted/40"
                          }`}
                        >
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => toggleResource(r.id)}
                            disabled={readOnly}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate">
                                {r.title}
                              </span>
                              {r.resourceType && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0 h-4"
                                >
                                  {r.resourceType}
                                </Badge>
                              )}
                              {r.resourceCategory && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0 h-4"
                                >
                                  {r.resourceCategory}
                                </Badge>
                              )}
                            </div>
                            {typeof r.leadCount === "number" && (
                              <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                {r.leadCount} download
                                {r.leadCount === 1 ? "" : "s"}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
                  </>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ================================================ User Signup */}
          <AccordionItem
            value="user_signup"
            className="border rounded-md px-3"
          >
            <AccordionTrigger className="py-3 hover:no-underline">
              <SectionHeader
                icon={<UserPlus className="h-4 w-4 text-muted-foreground" />}
                title="User Signup"
                hint="Fires when someone creates an account"
                count={userSignups ? 1 : 0}
                booleanCount
              />
            </AccordionTrigger>
            <AccordionContent>
              <div className="pt-1 pb-2">
                <label className="flex items-start gap-3 cursor-pointer hover:bg-muted/40 rounded p-2 border">
                  <Checkbox
                    checked={userSignups}
                    onCheckedChange={(v) => setUserSignups(v === true)}
                    disabled={readOnly}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      Any new user signup
                    </div>
                    <div className="text-xs text-muted-foreground">
                      POST /user/signup — both email/password and Google sign-in
                    </div>
                  </div>
                </label>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* =============================================== Meta Forms */}
          <AccordionItem value="meta_forms" className="border rounded-md px-3">
            <AccordionTrigger className="py-3 hover:no-underline">
              <SectionHeader
                icon={<Megaphone className="h-4 w-4 text-muted-foreground" />}
                title="Meta ad forms"
                hint="Fires when a new lead arrives from a selected Meta form"
                count={metaFormIds.size}
                countLabel="form"
                anyMode={metaAny}
              />
            </AccordionTrigger>
            <AccordionContent>
              <div className="pt-1 pb-2">
                <label className="flex items-center gap-3 cursor-pointer rounded p-2 border border-dashed bg-muted/30 mb-2">
                  <Checkbox
                    checked={metaAny}
                    onCheckedChange={toggleAllMetaForms}
                    disabled={readOnly}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Any Meta lead</div>
                    <div className="text-xs text-muted-foreground">
                      Fires for every lead synced from Meta — any form,
                      including forms connected in the future.
                    </div>
                  </div>
                </label>
                {metaAny ? (
                  <div className="text-sm text-muted-foreground py-6 text-center border rounded-md bg-muted/20">
                    Wildcard mode — every synced Meta lead triggers this
                    workflow. Untick <strong>Any Meta lead</strong> above to
                    pick specific forms instead.
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 items-center mb-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search Meta forms..."
                          value={metaSearch}
                          onChange={(e) => setMetaSearch(e.target.value)}
                          className="pl-9 h-8 text-sm"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs cursor-pointer whitespace-nowrap">
                        <Checkbox
                          checked={metaShowSelectedOnly}
                          onCheckedChange={(v) =>
                            setMetaShowSelectedOnly(v === true)
                          }
                        />
                        Selected only
                      </label>
                    </div>

                    {metaFormsLoading ? (
                      <div className="flex items-center text-xs text-muted-foreground py-6 justify-center">
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />{" "}
                        Loading Meta forms…
                      </div>
                    ) : filteredMetaForms.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-6 text-center border rounded-md">
                        {metaForms.length === 0
                          ? "No Meta forms connected — sync forms under Integrations → Meta first"
                          : "No Meta forms match the search"}
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-y-auto border rounded-md p-2 space-y-1">
                        {filteredMetaForms.map((f) => {
                          const selected = metaFormIds.has(f.form_id);
                          const unmapped = (f.leadTypes || []).length === 0;
                          return (
                            <label
                              key={f.form_id}
                              className={`flex items-start gap-3 cursor-pointer rounded p-2 border transition ${
                                selected
                                  ? "border-primary/40 bg-primary/5"
                                  : "border-transparent hover:bg-muted/40"
                              }`}
                            >
                              <Checkbox
                                checked={selected}
                                onCheckedChange={() => toggleMetaForm(f.form_id)}
                                disabled={readOnly}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium truncate">
                                    {f.form_name || f.form_id}
                                  </span>
                                  {f.page_name && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] px-1.5 py-0 h-4"
                                    >
                                      {f.page_name}
                                    </Badge>
                                  )}
                                  {(f.leadTypes || []).map((t) => (
                                    <Badge
                                      key={t.id}
                                      variant="outline"
                                      className="text-[10px] px-1.5 py-0 h-4"
                                    >
                                      {t.name}
                                    </Badge>
                                  ))}
                                </div>
                                {unmapped && (
                                  <div className="text-[11px] text-muted-foreground mt-0.5">
                                    No lead type mapped — leads sync without a
                                    type and still trigger workflows.
                                  </div>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/*
            Adding a new top-level source (e.g. "Page link visited"):
            drop in another <AccordionItem value="...">. The dialog auto-
            includes it; just plumb encode/decode for the new source type
            in this file and add the matching source key to the backend
            SUPPORTED set in publishWorkflow.js.
          */}
        </Accordion>

        <DialogFooter>
          <div className="flex items-center gap-3 mr-auto">
            {!readOnly && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                disabled={saving || totalSelected === 0}
              >
                Clear all
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              {totalSelected} selected
            </span>
          </div>
          {readOnly ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionHeader({
  icon,
  title,
  hint,
  count,
  countLabel,
  booleanCount,
  anyMode,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  count: number;
  countLabel?: string;
  booleanCount?: boolean;
  /** When true, shows "Any" badge instead of an item count. */
  anyMode?: boolean;
}) {
  const showBadge = anyMode || count > 0;
  return (
    <div className="flex items-center gap-2 w-full pr-2 text-left">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="font-medium leading-tight">{title}</div>
        <div className="text-xs text-muted-foreground font-normal">{hint}</div>
      </div>
      {showBadge && (
        <Badge variant="secondary" className="text-xs shrink-0">
          {anyMode
            ? "Any (incl. future)"
            : booleanCount
              ? "Enabled"
              : `${count} ${countLabel}${count === 1 ? "" : "s"} selected`}
        </Badge>
      )}
    </div>
  );
}
