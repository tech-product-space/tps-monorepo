"use client";

import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import PlatformLeadFilters from "./filters/PlatformLeadFilters";
import ExternalLeadFilters from "./filters/ExternalLeadFilters";
import { ILeadType } from "@/types/externalLead";
import { externalLeadService } from "@/services/Leads/externalLeadService";
import { ChevronRight, FileText, Users, Video } from "lucide-react";
import { campaignService } from "@/services/campaign/campaignService";
import EventGuestsStep, {
  EVENT_EMAIL_TARGET_ROLES,
  EVENT_EMAIL_TARGET_TYPES,
  ICampaignEvent,
  IEventFilter,
} from "./filters/EventGuestsStep";
import ResourceLeadsStep from "./filters/ResourceLeadsStep";
import RecordingLeadsStep from "./filters/RecordingLeadsStep";
import { ContactList, contactService } from "@/services/contact/contactService";
import ContactListStep from "./filters/UploadedLeadsStep";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value?: any;
  onChange: (filters: any) => Promise<void>;
  /** When true the dialog is view-only — source toggles and filter controls
   *  are inert, the Apply button is hidden, and the cancel button reads
   *  "Close". Internal local toggles are still possible but discarded on
   *  Close since onChange is never invoked. */
  readOnly?: boolean;
};

const SOURCES = [
  { id: "platform_leads", label: "Platform Leads" },
  { id: "external_leads", label: "External Leads" },
  { id: "events", label: "Event Leads" },
  { id: "resources", label: "Resource Leads" },
  { id: "recordings", label: "Recording Signups" },
  { id: "contact_list", label: "Contact List" },
];

type ViewState =
  | { type: "main" }
  | { type: "event_guests" }
  | { type: "resource_leads" }
  | { type: "recording_leads" }
  | { type: "contact_list" };

export default function LeadSelector({
  open,
  onOpenChange,
  value,
  onChange,
  readOnly = false,
}: Props) {
  const [filters, setFilters] = useState<any>(value || { sources: [] });
  const [openItems, setOpenItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [externalLeadTypes, setExternalLeadTypes] = useState<ILeadType[]>([]);

  const [view, setView] = useState<ViewState>({ type: "main" });

  const [selectedEventIds, setSelectedEventIds] = useState<number[]>([]);
  const [eventFilters, setEventFilters] = useState<
    Record<number, IEventFilter>
  >({});

  const [campaignEvents, setCampaignEvents] = useState<ICampaignEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const [campaignResources, setCampaignResources] = useState<any[]>([]);
  const [resourceTypes, setResourceTypes] = useState<string[]>([]);
  const [resourceCategories, setResourceCategories] = useState<string[]>([]);
  const [resourceJobTitle, setResourceJobTitles] = useState<string[]>([]);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [resourceFilters, setResourceFilters] = useState<Record<number, any>>(
    {},
  );

  const [selectedRecordingIds, setSelectedRecordingIds] = useState<string[]>(
    [],
  );
  const [recordingCategoryIds, setRecordingCategoryIds] = useState<string[]>([]);

  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [contactListsLoading, setContactListsLoading] = useState(false);

  useEffect(() => {
    const fetchTypes = async () => {
      const res = await externalLeadService.getLeadTypes();
      setExternalLeadTypes(res.types);
    };
    fetchTypes();
  }, []);

  useEffect(() => {
    if (!open) return;

    const fetchData = async () => {
      const eventsRes = await campaignService.getCampaignEvents();
      setCampaignEvents(eventsRes.events);

      const resourcesRes = await campaignService.getCampaignResources();

      setCampaignResources(resourcesRes.data);
      setResourceTypes(resourcesRes.resourceTypes);
      setResourceCategories(resourcesRes.resourceCategories);
      setResourceJobTitles(resourcesRes.jobTitles);

      setContactListsLoading(true);
      try {
        const contactListsRes = await contactService.getContactLists();
        setContactLists(contactListsRes);
      } catch (err) {
        console.error("Failed to fetch contact lists", err);
      } finally {
        setContactListsLoading(false);
      }
    };

    fetchData();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const val = value || { sources: [] };

    setFilters(val);
    setOpenItems(val.sources?.map((s: any) => s.type) || []);

    const eventSource = val.sources?.find((s: any) => s.type === "events");

    const restoredEventFilters = eventSource?.filters?.eventFilters || {};

    setEventFilters(restoredEventFilters);

    setSelectedEventIds(Object.keys(restoredEventFilters).map(Number));

    const resourceSource = val.sources?.find(
      (s: any) => s.type === "resources",
    );

    const restoredResourceFilters =
      resourceSource?.filters?.resourceFilters || {};

    setResourceFilters(restoredResourceFilters);

    setSelectedResourceIds(Object.keys(restoredResourceFilters).map(Number));

    const recordingSource = val.sources?.find(
      (s: any) => s.type === "recordings",
    );

    setSelectedRecordingIds(
      Object.keys(recordingSource?.filters?.recordingFilters || {}),
    );
    setRecordingCategoryIds(recordingSource?.filters?.categoryIds || []);

    const uploadedSource = val.sources?.find(
      (s: any) => s.type === "contact_list",
    );
    setSelectedListIds(uploadedSource?.filters?.contactListIds || []);
  }, [value, open]);

  const isSelected = (type: string) =>
    filters.sources?.some((s: any) => s.type === type);

  const toggleSource = (type: string) => {
    const exists = isSelected(type);
    if (exists) {
      setFilters({
        sources: filters.sources.filter((s: any) => s.type !== type),
      });
      setOpenItems((prev) => prev.filter((i) => i !== type));
    } else {
      setFilters({
        sources: [...filters.sources, { type, filters: {} }],
      });
      setOpenItems((prev) => [...prev, type]);
    }
  };

  // Only eventFilters in the payload — no eventIds
  const syncEventsToFilters = (
    nextEventFilters: Record<number, IEventFilter>,
  ) => {
    const hasEventsSource = filters.sources.some(
      (s: any) => s.type === "events",
    );

    const updatedSources = hasEventsSource
      ? filters.sources.map((s: any) =>
          s.type === "events"
            ? { ...s, filters: { eventFilters: nextEventFilters } }
            : s,
        )
      : [
          ...filters.sources,
          { type: "events", filters: { eventFilters: nextEventFilters } },
        ];

    setFilters({ sources: updatedSources });
  };

  const toggleEventId = (id: number) => {
    setSelectedEventIds((prev) => {
      const isRemoving = prev.includes(id);
      const next = isRemoving ? prev.filter((e) => e !== id) : [...prev, id];

      const nextEventFilters = { ...eventFilters };

      if (!isRemoving) {
        // Add with defaults only if not already present
        if (!nextEventFilters[id]) {
          nextEventFilters[id] = {
            targetGuestType: EVENT_EMAIL_TARGET_TYPES.ALL,
            targetGuestRole: EVENT_EMAIL_TARGET_ROLES.ALL,
          };
        }
      } else {
        // Remove the entry entirely when deselected
        delete nextEventFilters[id];
      }

      setEventFilters(nextEventFilters);
      syncEventsToFilters(nextEventFilters);
      return next;
    });
  };

  const handleFilterChange = (
    eventId: number,
    patch: Partial<IEventFilter>,
  ) => {
    setEventFilters((prev) => {
      const next = {
        ...prev,
        [eventId]: {
          ...{
            targetGuestType: EVENT_EMAIL_TARGET_TYPES.ALL,
            targetGuestRole: EVENT_EMAIL_TARGET_ROLES.ALL,
          },
          ...prev[eventId],
          ...patch,
        },
      };
      syncEventsToFilters(next);
      return next;
    });
  };

  const syncResourcesToFilters = (nextResourceFilters: any) => {
    const updatedSources = filters.sources.map((s: any) =>
      s.type === "resources"
        ? { ...s, filters: { resourceFilters: nextResourceFilters } }
        : s,
    );

    setFilters({ sources: updatedSources });
  };

  const toggleResourceId = (id: number) => {
    setSelectedResourceIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((r) => r !== id)
        : [...prev, id];

      const nextFilters = { ...resourceFilters };

      if (prev.includes(id)) delete nextFilters[id];
      else nextFilters[id] = {};

      setResourceFilters(nextFilters);
      syncResourcesToFilters(nextFilters);

      return next;
    });
  };

  const handleResourceFilterChange = (resourceId: number, patch: any) => {
    setResourceFilters((prev) => {
      const next = {
        ...prev,
        [resourceId]: {
          ...prev[resourceId],
          ...patch,
        },
      };

      syncResourcesToFilters(next);
      return next;
    });
  };

  /**
   * Both halves of the recordings filter travel together, because the resolver
   * reads them together: a list of recordings, a list of categories, or neither.
   * Writing only the half that changed would leave the other one behind from a
   * previous edit and quietly narrow the audience.
   */
  const syncRecordingsToFilters = (
    nextRecordingIds: string[],
    nextCategoryIds: string[],
  ) => {
    const recordingFilters = Object.fromEntries(
      nextRecordingIds.map((id) => [id, {}]),
    );

    const hasRecordingsSource = filters.sources.some(
      (s: any) => s.type === "recordings",
    );

    const nextFilters = { recordingFilters, categoryIds: nextCategoryIds };

    const updatedSources = hasRecordingsSource
      ? filters.sources.map((s: any) =>
          s.type === "recordings" ? { ...s, filters: nextFilters } : s,
        )
      : [...filters.sources, { type: "recordings", filters: nextFilters }];

    setFilters({ sources: updatedSources });
  };

  const toggleRecordingId = (id: string) => {
    setSelectedRecordingIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((r) => r !== id)
        : [...prev, id];

      syncRecordingsToFilters(next, recordingCategoryIds);
      return next;
    });
  };

  const handleRecordingCategoriesChange = (ids: string[]) => {
    setRecordingCategoryIds(ids);
    syncRecordingsToFilters(selectedRecordingIds, ids);
  };

  const syncUploadedLeadsToFilters = (nextListIds: string[]) => {
    const hasUploadedSource = filters.sources.some(
      (s: any) => s.type === "contact_list",
    );

    const updatedSources = hasUploadedSource
      ? filters.sources.map((s: any) =>
          s.type === "contact_list"
            ? { ...s, filters: { contactListIds: nextListIds } }
            : s,
        )
      : [
          ...filters.sources,
          {
            type: "contact_list",
            filters: { contactListIds: nextListIds },
          },
        ];

    setFilters({ sources: updatedSources });
  };

  const toggleListId = (id: string) => {
    setSelectedListIds((prev) => {
      const isRemoving = prev.includes(id);
      const next = isRemoving ? prev.filter((l) => l !== id) : [...prev, id];

      syncUploadedLeadsToFilters(next);
      return next;
    });
  };

  const save = async () => {
    setLoading(true);
    try {
      await onChange(filters);
    } finally {
      setLoading(false);
    }
  };

  const baseTitle =
    view.type === "main"
      ? "Select Lead Source"
      : view.type === "event_guests"
        ? "Event Guests"
        : view.type === "contact_list"
          ? "Uploaded Contact Lists"
          : view.type === "recording_leads"
            ? "Recording Signups"
            : "Resource Leads";
  const dialogTitle = readOnly ? `${baseTitle} (view only)` : baseTitle;

  const dialogDescription = readOnly
    ? "Sources currently feeding this workflow. To change them, pause the workflow first."
    : view.type === "main"
      ? "Enable lead sources and configure filters to choose recipients."
      : view.type === "event_guests"
        ? "Select events to include their guests as campaign recipients."
        : view.type === "contact_list"
          ? "Select one or more contact lists to include as campaign recipients."
          : view.type === "recording_leads"
            ? "Choose whose recording signups to include — specific recordings, or whole categories."
            : "Select resources to include their leads as campaign recipients.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-6xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <p className="text-sm text-muted-foreground">{dialogDescription}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 min-h-0">
          {/* Main view */}
          {view.type === "main" && (
            <div className="space-y-1">
              <Accordion
                type="multiple"
                value={openItems}
                onValueChange={(v) => setOpenItems(v)}
                className="w-full"
              >
                {SOURCES.map((source) => {
                  const selected = isSelected(source.id);
                  return (
                    <AccordionItem key={source.id} value={source.id}>
                      <div
                        className={`flex items-center gap-3 px-3 py-2 rounded-md ${
                          selected ? "bg-muted/40" : ""
                        }`}
                      >
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => toggleSource(source.id)}
                          disabled={readOnly}
                        />
                        <AccordionTrigger className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <Label className="font-semibold cursor-pointer">
                              {source.label}
                            </Label>
                          </div>
                        </AccordionTrigger>
                      </div>

                      <AccordionContent className="px-5">
                        {!selected && (
                          <div className="text-sm text-muted-foreground py-3 px-4">
                            Enable this source to configure filters
                          </div>
                        )}
                        {selected && (
                          <div className="space-y-4 pt-2">
                            {source.id === "platform_leads" && (
                              <div
                                className={
                                  readOnly
                                    ? "pointer-events-none opacity-70"
                                    : ""
                                }
                              >
                                <PlatformLeadFilters
                                  value={
                                    filters.sources.find(
                                      (s: any) => s.type === "platform_leads",
                                    )?.filters
                                  }
                                  onChange={(val) => {
                                    const updated = filters.sources.map(
                                      (s: any) =>
                                        s.type === "platform_leads"
                                          ? { ...s, filters: val }
                                          : s,
                                    );
                                    setFilters({ sources: updated });
                                  }}
                                />
                              </div>
                            )}

                            {source.id === "external_leads" && (
                              <div
                                className={
                                  readOnly
                                    ? "pointer-events-none opacity-70"
                                    : ""
                                }
                              >
                                <ExternalLeadFilters
                                  types={externalLeadTypes}
                                  value={
                                    filters.sources.find(
                                      (s: any) => s.type === "external_leads",
                                    )?.filters
                                  }
                                  onChange={(val) => {
                                    const updated = filters.sources.map(
                                      (s: any) =>
                                        s.type === "external_leads"
                                          ? { ...s, filters: val }
                                          : s,
                                    );
                                    setFilters({ sources: updated });
                                  }}
                                />
                              </div>
                            )}

                            {source.id === "events" && (
                              <button
                                type="button"
                                onClick={() =>
                                  setView({ type: "event_guests" })
                                }
                                className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/40 transition-all group"
                              >
                                <div className="flex items-center gap-2">
                                  <Users className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                  <span className="text-sm font-medium group-hover:text-primary transition-colors">
                                    Select Event Guests
                                  </span>
                                  {selectedEventIds.length > 0 ? (
                                    <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs font-medium px-2 py-0.5">
                                      {selectedEventIds.length} event
                                      {selectedEventIds.length > 1
                                        ? "s"
                                        : ""}{" "}
                                      selected
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      Click to choose events
                                    </span>
                                  )}
                                </div>
                                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                              </button>
                            )}

                            {source.id === "resources" && (
                              <button
                                type="button"
                                onClick={() =>
                                  setView({ type: "resource_leads" })
                                }
                                className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/40 transition-all group"
                              >
                                <div className="flex items-center gap-2">
                                  <FileText className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />

                                  <span className="text-sm font-medium group-hover:text-primary transition-colors">
                                    Select Resource Leads
                                  </span>

                                  {selectedResourceIds.length > 0 ? (
                                    <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs font-medium px-2 py-0.5">
                                      {selectedResourceIds.length} resource
                                      {selectedResourceIds.length > 1
                                        ? "s"
                                        : ""}{" "}
                                      selected
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      Click to choose resources
                                    </span>
                                  )}
                                </div>

                                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                              </button>
                            )}

                            {source.id === "recordings" && (
                              <button
                                type="button"
                                onClick={() =>
                                  setView({ type: "recording_leads" })
                                }
                                className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/40 transition-all group"
                              >
                                <div className="flex items-center gap-2">
                                  <Video className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />

                                  <span className="text-sm font-medium group-hover:text-primary transition-colors">
                                    Select Recording Signups
                                  </span>

                                  {selectedRecordingIds.length > 0 ? (
                                    <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs font-medium px-2 py-0.5">
                                      {selectedRecordingIds.length} recording
                                      {selectedRecordingIds.length > 1
                                        ? "s"
                                        : ""}{" "}
                                      selected
                                    </span>
                                  ) : recordingCategoryIds.length > 0 ? (
                                    <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs font-medium px-2 py-0.5">
                                      {recordingCategoryIds.length} categor
                                      {recordingCategoryIds.length > 1
                                        ? "ies"
                                        : "y"}{" "}
                                      selected
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      Click to choose recordings
                                    </span>
                                  )}
                                </div>

                                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                              </button>
                            )}

                            {source.id === "contact_list" && (
                              <button
                                type="button"
                                onClick={() =>
                                  setView({ type: "contact_list" })
                                }
                                className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/40 transition-all group"
                              >
                                <div className="flex items-center gap-2">
                                  <Users className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                  <span className="text-sm font-medium group-hover:text-primary transition-colors">
                                    Select Contact Lists
                                  </span>
                                  {selectedListIds.length > 0 ? (
                                    <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs font-medium px-2 py-0.5">
                                      {selectedListIds.length} list
                                      {selectedListIds.length > 1
                                        ? "s"
                                        : ""}{" "}
                                      selected
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      Click to choose contact lists
                                    </span>
                                  )}
                                </div>
                                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                              </button>
                            )}
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </div>
          )}

          {view.type === "event_guests" && (
            <div className={readOnly ? "pointer-events-none opacity-70" : ""}>
              <EventGuestsStep
                events={campaignEvents}
                loading={eventsLoading}
                selectedEventIds={selectedEventIds}
                onToggleEvent={toggleEventId}
                eventFilters={eventFilters}
                onFilterChange={handleFilterChange}
              />
            </div>
          )}

          {view.type === "resource_leads" && (
            <div className={readOnly ? "pointer-events-none opacity-70" : ""}>
              <ResourceLeadsStep
                resources={campaignResources}
                resourceTypes={resourceTypes}
                resourceCategories={resourceCategories}
                jobTitles={resourceJobTitle}
                loading={false}
                selectedResourceIds={selectedResourceIds}
                onToggleResource={toggleResourceId}
                resourceFilters={resourceFilters}
                onFilterChange={handleResourceFilterChange}
              />
            </div>
          )}

          {view.type === "recording_leads" && (
            <div className={readOnly ? "pointer-events-none opacity-70" : ""}>
              <RecordingLeadsStep
                selectedRecordingIds={selectedRecordingIds}
                categoryIds={recordingCategoryIds}
                onToggleRecording={toggleRecordingId}
                onCategoriesChange={handleRecordingCategoriesChange}
              />
            </div>
          )}

          {view.type === "contact_list" && (
            <div className={readOnly ? "pointer-events-none opacity-70" : ""}>
              <ContactListStep
                contactLists={contactLists}
                loading={contactListsLoading}
                selectedListIds={selectedListIds}
                onToggleList={toggleListId}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter>
          {view.type !== "main" && (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={() => setView({ type: "main" })}
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
              <Button onClick={save} disabled={loading}>
                {loading ? "Applying..." : "Apply"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
