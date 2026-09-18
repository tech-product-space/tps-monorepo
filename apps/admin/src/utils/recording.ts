import { RecordingContent } from "@/types/recording";

/**
 * Mirrors `constants/recording.js` in `tps-next-backend`. Change both together —
 * the API validates `format` and drops unknown `content` keys, so a value that
 * exists only here is silently discarded on save.
 */

/**
 * The badge on a card — what kind of session this was.
 *
 * The first three are the values the event form offers, because they describe
 * the same thing. **Masterclass is the standalone one** — a studio session or an
 * imported talk that was never run as a live event. A recording with no format
 * has no badge.
 */
export const RECORDING_FORMATS = [
  "Workshop",
  "Hackathon",
  "Teardown",
  "Masterclass",
] as const;

/**
 * The content section renders itself from this list.
 *
 * That is the whole point of `content` being one JSONB column: adding
 * "Prerequisites" later should be one entry here plus one in the backend
 * constant, with no migration and no new form component. Hand-writing a card per
 * block would work today and re-open this file every time.
 */
export type ContentBlock = {
  /**
   * Must be a key of `RecordingContent`, so adding a block here without adding
   * it to the type is a compile error rather than a field that silently never
   * saves.
   */
  key: keyof RecordingContent;
  label: string;
  help?: string;
  placeholder?: string;
};

export const CONTENT_BLOCKS: ContentBlock[] = [
  {
    key: "whatYouWillLearn",
    label: "What you'll learn",
    help: "Rich text — headings, bulleted or numbered lists, links, bold and italic.",
    placeholder:
      "Use a bulleted list, or write it as prose. Whatever reads best.",
  },
  {
    key: "whyThisMatters",
    label: "Why this topic matters",
    help: "Rich text — same tools.",
    placeholder: "Why should somebody spend an hour on this?",
  },
  {
    key: "keyTakeaways",
    label: "Key takeaways",
    help: "Rich text — same tools.",
    placeholder:
      "The two or three things somebody should be able to do afterwards.",
  },
];

/**
 * Defaults mirroring `RECORDING_SETTINGS_DEFAULTS`.
 *
 * A recording saved before a switch existed stores nothing for it, and the
 * backend resolver layers these underneath — so the form must show the default
 * rather than an unchecked box, or an admin sees "off" for something that is on.
 */
export const RECORDING_SETTINGS_DEFAULTS = {
  gateVideo: true,
  showAttendeeCount: true,
  showKeepExploring: true,
};

export const SETTINGS_FIELDS: {
  key: keyof typeof RECORDING_SETTINGS_DEFAULTS;
  label: string;
  help: string;
}[] = [
  {
    key: "gateVideo",
    label: "Ask for an email before playing",
    help: "Off publishes the video URL with the page — anyone can watch without leaving an address.",
  },
  {
    key: "showAttendeeCount",
    label: "Show the attendee count",
    help: "Hidden anyway when the count is empty.",
  },
  {
    key: "showKeepExploring",
    label: "Show “Keep exploring”",
    help: "Falls back to the newest recordings in the same category.",
  },
];

/** Max "Keep exploring" picks — mirrors RECORDING_RELATED_LIMIT. */
export const RELATED_LIMIT = 3;

/**
 * Whether the public URL actually resolves right now.
 *
 * **Published is not the same as reachable.** A recording with a `scheduledAt`
 * still in the future is published and its page 404s until that date, so
 * anything that offers a link out to the site has to ask this rather than
 * reading `isPublished` — otherwise the one state most in need of a preview is
 * the state that gets sent to a 404.
 */
export const isRecordingLive = (recording: {
  isPublished?: boolean;
  scheduledAt?: string | null;
}): boolean =>
  Boolean(recording.isPublished) &&
  (!recording.scheduledAt || new Date(recording.scheduledAt) <= new Date());

export const RECORDING_SORTS = [
  { value: "recent", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title", label: "Title A–Z" },
  { value: "views", label: "Most watched" },
  { value: "longest", label: "Longest" },
];

/**
 * YouTube URL → video id, for the editor's read-back only.
 *
 * The API parses independently and is the authority; this exists so a mistyped
 * link is visible before saving rather than after publishing. Keep it in step
 * with `utils/youtube.js` on the backend.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const PATH_PREFIXES = ["embed", "live", "shorts", "v"];
const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
  "www.youtu.be",
]);

export const parseYouTubeVideoId = (input: string): string | null => {
  if (typeof input !== "string") return null;

  const value = input.trim();
  if (!value) return null;
  if (ID_PATTERN.test(value)) return value;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }

  if (!HOSTS.has(url.hostname.toLowerCase())) return null;

  const queryId = url.searchParams.get("v");
  if (queryId && ID_PATTERN.test(queryId)) return queryId;

  const segments = url.pathname.split("/").filter(Boolean);
  if (!segments.length) return null;

  if (url.hostname.toLowerCase().endsWith("youtu.be")) {
    return ID_PATTERN.test(segments[0]) ? segments[0] : null;
  }

  if (PATH_PREFIXES.includes(segments[0]) && segments[1]) {
    return ID_PATTERN.test(segments[1]) ? segments[1] : null;
  }

  return null;
};

/** "1 hr 38 mins" — the card's format, reused in the admin table. */
export const formatDuration = (minutes?: number | null): string => {
  if (!minutes) return "—";
  if (minutes < 60) return `${minutes} mins`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest ? `${hours} hr ${rest} mins` : `${hours} hr`;
};

export const slugifyRecording = (title: string) =>
  title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
