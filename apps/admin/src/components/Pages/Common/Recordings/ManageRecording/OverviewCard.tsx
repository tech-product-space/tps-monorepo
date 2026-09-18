"use client";

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Lock,
  Tag,
  Unlock,
  Users,
  Video,
} from "lucide-react";

import {
  RECORDING_SETTINGS_DEFAULTS,
  formatDuration,
  isRecordingLive,
} from "@/utils/recording";
import { RecordingResponse } from "@/types/recording";

/**
 * What this recording *is*, above the tabs.
 *
 * A manage screen that opens straight onto a lead table answers "who watched"
 * without ever answering "is this thing even reachable". Those are different
 * questions and the second is usually the one somebody is here to check — a
 * recording sitting in draft collects no leads, and an empty table looks
 * identical whether nobody watched or nobody could.
 *
 * So: the state in words, the facts that decide it, and a warning strip when
 * something is actually blocking it.
 */

const formatDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

/**
 * Three states, not two.
 *
 * "Published" is not the same as "reachable": a recording with a `scheduledAt`
 * in the future is published and still 404s. Collapsing those into one green
 * pill is what sends somebody hunting for a switch that is already on.
 */
type Status = {
  label: string;
  className: string;
  icon: typeof CheckCircle2;
};

export const recordingStatus = (recording: RecordingResponse): Status => {
  if (!recording.isPublished) {
    return {
      label: "Draft",
      className: "bg-amber-400/90 text-amber-950",
      icon: AlertTriangle,
    };
  }

  if (!isRecordingLive(recording)) {
    return {
      label: "Scheduled",
      className: "bg-sky-500/90 text-white",
      icon: CalendarClock,
    };
  }

  return {
    label: "Live",
    className: "bg-emerald-500/90 text-white",
    icon: CheckCircle2,
  };
};

/**
 * The one sentence that says why the public cannot see this, or that they can.
 *
 * Ordered by what blocks first: a missing video stops publishing at all, so it
 * outranks the publish flag, which outranks the date.
 */
const situation = (
  recording: RecordingResponse
): { tone: "warn" | "ok"; text: string } => {
  if (!recording.video?.videoId) {
    return {
      tone: "warn",
      text: "No video link yet — this recording cannot be published until one is added on the edit screen.",
    };
  }

  if (!recording.isPublished) {
    return {
      tone: "warn",
      text: "Still a draft. The page 404s for everybody, so no leads will arrive until it is published.",
    };
  }

  const scheduled = recording.scheduledAt
    ? new Date(recording.scheduledAt)
    : null;

  if (scheduled && scheduled > new Date()) {
    return {
      tone: "warn",
      text: `Published, but held until ${formatDate(recording.scheduledAt)}. Until then the page 404s.`,
    };
  }

  return { tone: "ok", text: "Live. Anyone with the link can reach this page." };
};

const Fact = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Tag;
  label: string;
  value: string;
}) => (
  <div className="flex items-start gap-2.5">
    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
    <div className="min-w-0">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="truncate text-sm text-gray-900">{value}</p>
    </div>
  </div>
);

export default function OverviewCard({
  recording,
  leadCount,
}: {
  recording: RecordingResponse;
  /** Distinct people, from the leads request — not `viewCount`. */
  leadCount: number;
}) {
  const status = recordingStatus(recording);
  const StatusIcon = status.icon;
  const note = situation(recording);

  const gated =
    recording.settings?.gateVideo ?? RECORDING_SETTINGS_DEFAULTS.gateVideo;

  const length =
    recording.durationMinutes != null
      ? formatDuration(recording.durationMinutes)
      : null;
  const liveOn = formatDate(recording.scheduledAt ?? recording.publishedAt);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-col gap-5 p-5 lg:flex-row">
        {/* 16:9 because that is the shape it is cropped to on the public pages —
            a square here would flatter a thumbnail that is about to be
            letterboxed.

            `lg:self-start` is what makes that ratio hold: this is a flex item,
            and a flex row stretches its items to the row's height, which beats
            `aspect-video` outright. Left alone the box grows to match the taller
            facts column beside it and `object-cover` crops a 16:9 thumbnail into
            a portrait one. On small screens the row is a column, where stretch
            only sets the width — so it is breakpoint-scoped. */}
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 lg:w-64 lg:self-start">
          {recording.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={recording.thumbnail}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 text-gray-400">
              <Video className="h-6 w-6" />
              <span className="text-xs">No thumbnail</span>
            </div>
          )}

          <span
            className={`absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold backdrop-blur-sm ${status.className}`}
          >
            <StatusIcon className="h-3 w-3" />
            {status.label}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-gray-900">
              {recording.title}
            </h2>
            <p className="truncate text-xs text-gray-500">
              /recordings/{recording.slug}
            </p>
            {recording.subtitle && (
              <p className="mt-1.5 line-clamp-2 text-sm text-gray-600">
                {recording.subtitle}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Fact
              icon={Users}
              label="Watched by"
              value={`${leadCount} ${leadCount === 1 ? "person" : "people"}`}
            />
            <Fact
              icon={Tag}
              label="Category"
              value={recording.category?.name ?? "Uncategorised"}
            />
            <Fact icon={Clock} label="Length" value={length ?? "Not set"} />
            <Fact
              icon={gated ? Lock : Unlock}
              label="Video"
              value={gated ? "Behind the email gate" : "Open to everyone"}
            />
            <Fact
              icon={CalendarClock}
              label={
                recording.scheduledAt &&
                new Date(recording.scheduledAt) > new Date()
                  ? "Goes live"
                  : "Published"
              }
              value={liveOn ?? "Not yet"}
            />
          </div>

          <p
            className={`rounded-md border px-3 py-2 text-xs ${
              note.tone === "warn"
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-emerald-300 bg-emerald-50 text-emerald-800"
            }`}
          >
            {note.text}
          </p>
        </div>
      </div>
    </div>
  );
}
