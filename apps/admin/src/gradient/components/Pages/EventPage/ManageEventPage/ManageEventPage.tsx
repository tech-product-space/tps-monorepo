"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import DashboardLayout from "@/gradient/components/DashboardLayout";
import { eventService } from "@/gradient/services/eventService";
import { EventResponse, EventRegistration } from "@/gradient/types/event";
import OverviewSection from "./OverviewSection/OverviewSection";
import RegistrationSection from "./RegistrationSection/RegistrationSection";
import { IPaginationMeta } from "@/gradient/components/ui/custom/Pagination";
import ReminderEmailSection from "./ReminderEmailSection/ReminderEmailSection";
import ReferralSection from "./ReferralSection/ReferralSection";
import FeedbackSection from "./FeedbackSection/FeedbackSection";
import CertificateSection from "./CertificateSection/CertificateSection";
import SettingsSection from "./SettingsSection/SettingsSection";

type ManageEventTab =
  | "overview"
  | "registrations"
  | "referrals"
  | "reminderEmail"
  | "feedback"
  | "certificate"
  | "settings";

const MANAGE_EVENT_TABS: { key: ManageEventTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "registrations", label: "Registrations" },
  { key: "referrals", label: "Referrals" },
  { key: "reminderEmail", label: "Reminder Email" },
  { key: "feedback", label: "Feedback" },
  { key: "certificate", label: "Certificate" },
  { key: "settings", label: "Settings" },
];

export default function ManageEventPage({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const searchParams = useSearchParams();
  const router = useRouter();

  const isValidTab = (tab: string | null): tab is ManageEventTab => {
    return MANAGE_EVENT_TABS.some((t) => t.key === tab);
  };

  const tabFromUrl = searchParams.get("tab");
  const initialTab = isValidTab(tabFromUrl) ? tabFromUrl : "overview";

  const [activeTab, setActiveTabState] = useState<ManageEventTab>(initialTab);

  useEffect(() => {
    if (isValidTab(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTabState(tabFromUrl);
    }
  }, [tabFromUrl, activeTab]);

  const setActiveTab = (tab: ManageEventTab) => {
    setActiveTabState(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [meta, setMeta] = useState<IPaginationMeta>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [regLoading, setRegLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    const loadEvent = async () => {
      try {
        const response = await eventService.getEventById(eventId);
        setEvent(response);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [eventId]);

  const fetchRegistrations = useCallback(async () => {
    setRegLoading(true);
    try {
      const res = await eventService.getEventRegistrations(
        eventId,
        page,
        limit,
      );
      setRegistrations(res.data);
      setMeta(res.meta);
    } catch (error) {
      console.error(error);
    } finally {
      setRegLoading(false);
    }
  }, [eventId, page, limit]);

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
  };

  if (loading) {
    return (
      <DashboardLayout title="Manage Event">
        <div className="flex items-center justify-center p-20">
          <Loader2 className="animate-spin h-6 w-6" />
        </div>
      </DashboardLayout>
    );
  }

  if (!event) {
    return (
      <DashboardLayout title="Manage Event">
        <div className="p-6 text-center">
          <h2 className="text-xl font-semibold">Event not found</h2>
          <p className="text-muted-foreground">
            The requested event could not be retrieved.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={`Manage: ${event.eventTitle}`}>
      <div className="space-y-6">
        <div className="flex space-x-6 border-b border-border">
          {MANAGE_EVENT_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <OverviewSection event={event} meta={meta} />
        )}

        {activeTab === "registrations" && (
          <RegistrationSection
            eventId={event.id}
            eventType={event.eventType}
            registrations={registrations}
            meta={meta}
            regLoading={regLoading}
            handlePageChange={handlePageChange}
            handleLimitChange={handleLimitChange}
            fetchRegistrations={fetchRegistrations}
          />
        )}


        {activeTab === "referrals" && <ReferralSection eventId={event.id} />}

        {activeTab === "reminderEmail"  && (
          <ReminderEmailSection eventId={event.id}/>
        )}

        {activeTab === "feedback" && (
          <FeedbackSection
            eventId={event.id}
            eventSlug={event.eventSlug}
            canAcceptResponse={event.canAcceptResponse ?? false}
          />
        )}

        {activeTab === "certificate" && (
          <CertificateSection
            eventId={event.id}
            eventTitle={event.eventTitle}
          />
        )}

        {activeTab === "settings" && (
          <SettingsSection
            eventId={event.id}
            initialSettings={event.settings}
            // Tabs unmount when you leave them, so the settings this holds are
            // what the component reads on the way back. Without this it would
            // hand back the values from page load and a saved toggle would
            // appear to have sprung back.
            onSaved={(settings) =>
              setEvent((current) => (current ? { ...current, settings } : current))
            }
          />
        )}
      </div>
    </DashboardLayout>
  );
}
