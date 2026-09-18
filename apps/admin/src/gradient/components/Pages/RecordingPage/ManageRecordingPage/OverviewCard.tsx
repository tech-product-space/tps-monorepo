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

import { Card, CardContent } from "@/gradient/components/ui/card";
import { resolveStorageUrl } from "@/gradient/lib/storage";
import { RECORDING_SETTINGS_DEFAULTS } from "@/gradient/constants/recording";
import { RecordingResponse } from "@/gradient/types/recording";

/**
 * What this recording *is*, above the tabs.
 *
 * The manage screen used to open straight onto a lead table, which answered
 * "who watched" without ever answering "is this thing even reachable". Those
 * are different questions and the second one is the one an admin is usually on
 * this screen to check — a recording sitting in draft collects no leads, and an
 * empty table looks identical whether nobody watched or nobody could.
 *
 * So: the state in words, the facts that decide it, and a warning strip when
 * something is actually blocking it.
 */

/** "90" → "1 hr 30 mins". The badge on both public pages reads the same number. */
const formatDuration = (minutes?: number | null) => {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} mins`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest ? `${hours} hr ${rest} mins` : `${hours} hr`;
};

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
 * pill is what sends an admin hunting for a switch that is already on.
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

  if (recording.scheduledAt && new Date(recording.scheduledAt) > new Date()) {
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
const situation = (recording: RecordingResponse): { tone: "warn" | "ok"; text: string } => {
  if (!recording.video?.videoId) {
    return {
      tone: "warn",
      text: "No video link yet — this recording cannot be published until one is added on the Edit content screen.",
    };
  }

  if (!recording.isPublished) {
    return {
      tone: "warn",
      text: "Still a draft. The page 404s for everybody, so no leads will arrive until it is published.",
    };
  }

  const scheduled = recording.scheduledAt ? new Date(recording.scheduledAt) : null;

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
    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm">{value}</p>
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

  const thumbnail = recording.thumbnail
    ? resolveStorageUrl(recording.thumbnail)
    : null;

  const gated =
    recording.settings?.gateVideo ?? RECORDING_SETTINGS_DEFAULTS.gateVideo;

  const length = formatDuration(recording.durationMinutes);
  const liveOn = formatDate(recording.scheduledAt ?? recording.publishedAt);

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-5 lg:flex-row">
        {/* 16:9 because that is the shape it is cropped to on both public
            pages — a square here would flatter a thumbnail that is about to be
            letterboxed.

            `lg:self-start` is what makes that ratio hold. This is a flex item,
            and a flex row stretches its items to the row's height by default —
            an explicit height, which beats `aspect-video` outright. Left alone
            the box grew to match the taller facts column beside it and
            `object-cover` cropped a 16:9 thumbnail into a portrait one. On
            small screens the row is a column, so stretch only sets the width
            and the ratio survives — `self-start` there would collapse the box
            to nothing, which is why it is breakpoint-scoped. */}
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg border bg-muted lg:w-64 lg:self-start">
          {thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnail}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
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
            <h2 className="truncate text-base font-semibold">
              {recording.title}
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              /recordings/{recording.slug}
            </p>
            {recording.subtitle && (
              <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                {recording.subtitle}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {/* People, not plays — one row per person however many times or
                devices they watch from. The only viewing number there is;
                `viewCount` counts gate passes and is rendered nowhere. */}
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
            {/* The "From session" fact that used to sit here went with the
                event link itself — `RecordingResponse` no longer carries an
                `event`, so there is no provenance left to show. */}
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
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            }`}
          >
            {note.text}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
