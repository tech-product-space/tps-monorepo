import { EventResponse } from "@/gradient/types/event";
import { IPaginationMeta } from "@/gradient/components/ui/custom/Pagination";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Share2,
  ExternalLink,
} from "lucide-react";
import { resolveStorageUrl } from "@/gradient/lib/storage";
import MailingSection from "./MailingSection/MailingSection";
import { useRouter } from "next/navigation";

function formatDate(dateStr?: string) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(timeStr?: string) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

function getDay(dateStr?: string) {
  if (!dateStr) return null;
  return new Date(dateStr).getDate();
}

function getMonth(dateStr?: string) {
  if (!dateStr) return null;
  return new Date(dateStr)
    .toLocaleDateString("en-US", { month: "short" })
    .toUpperCase();
}

export default function OverviewSection({
  event,
  meta,
}: {
  event: EventResponse;
  meta: IPaginationMeta;
}) {
  const startDate = formatDate(event.eventStartDate);
  const endDate = formatDate(event.eventEndDate);
  const startTime = formatTime(event.eventStartTime);
  const endTime = formatTime(event.eventEndTime);
  const day = getDay(event.eventStartDate);
  const month = getMonth(event.eventStartDate);

  const router = useRouter();

  const handleEdit = (id: string) => {
    router.push(`/events/${id}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
        {/* Left: Large Event Image */}
        <div className="relative w-full overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800 aspect-video lg:aspect-auto lg:min-h-[300px]">
          {event.eventCreativeUrl ? (
            <img
              src={resolveStorageUrl(event.eventCreativeUrl)}
              alt={event.eventTitle}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center gap-2">
              <Calendar
                size={40}
                className="text-zinc-300 dark:text-zinc-600"
              />
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                No event image
              </p>
            </div>
          )}

          {/* Status pill over image */}
          <div className="absolute top-3 left-3">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm ${
                event.isPublished
                  ? "bg-emerald-500/90 text-white"
                  : "bg-amber-400/90 text-amber-900"
              }`}
            >
              {event.isPublished ? (
                <CheckCircle2 size={11} />
              ) : (
                <AlertCircle size={11} />
              )}
              {event.isPublished ? "Published" : "Draft"}
            </span>
          </div>
        </div>

        {/* Right: When & Where Panel */}
        <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 flex flex-col gap-5">
          {/* Header */}
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-0.5">
              {event.eventTitle}
            </h2>
            {event.eventSubtitle && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 line-clamp-2">
                {event.eventSubtitle}
              </p>
            )}
          </div>

          <hr className="border-zinc-100 dark:border-zinc-800" />

          {/* When & Where */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              When &amp; Where
            </p>

            {/* Date calendar block */}
            {day && month && (
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-11 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 text-center shadow-sm">
                  <div className="bg-zinc-800 dark:bg-zinc-700 text-white text-[10px] font-bold py-0.5 uppercase tracking-wider">
                    {month}
                  </div>
                  <div className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 text-lg font-bold leading-tight py-1">
                    {day}
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  {startDate && (
                    <span className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-200">
                      <Calendar size={13} className="text-zinc-400" />
                      {startDate}
                      {endDate && endDate !== startDate && (
                        <span className="text-zinc-400"> – {endDate}</span>
                      )}
                    </span>
                  )}
                  {startTime && (
                    <span className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-200">
                      <Clock size={13} className="text-zinc-400" />
                      {startTime}
                      {endTime && (
                        <span className="text-zinc-400"> – {endTime}</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Location */}
            {(event.location || event.locationType) && (
              <span className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                <MapPin size={13} className="text-zinc-400 flex-shrink-0" />
                {event.location ?? event.locationType}
              </span>
            )}

            {/* Registrations */}
            <span className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
              <Users size={13} className="text-zinc-400 flex-shrink-0" />
              {meta.total.toLocaleString()} Registrations
            </span>
          </div>

          <hr className="border-zinc-100 dark:border-zinc-800" />

          {/* Category + Type tags */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-md">
              {event.eventCategory}
            </span>
            {event.eventType && (
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2.5 py-1 rounded-md">
                {event.eventType}
              </span>
            )}
          </div>

          {/* Actions */}

          <div className="flex gap-2 mt-auto">
            <button
              onClick={() =>
                window.open(
                  `http://gradientlearnings.org/events/${event.eventSlug}`,
                  "_blank",
                )
              }
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg px-3 py-2 transition-colors"
            >
              <ExternalLink size={12} />
              Event Page
            </button>

            <button
              onClick={() => handleEdit(event.id)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg px-3 py-2 transition-colors"
            >
              <Pencil size={12} />
              Edit Event
            </button>
          </div>
        </div>
      </div>

      {/* Registration Email Section */}
      <MailingSection
        eventId={event.id}
        eventTitle={event.eventTitle}
        eventType={event.eventType}
      />
    </div>
  );
}
