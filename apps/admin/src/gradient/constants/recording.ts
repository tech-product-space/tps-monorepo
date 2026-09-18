/**
 * Mirrors `config/constants/recording.js` in `gradient-backend`. Change both
 * together — the API validates `format` and drops unknown `content` keys, so a
 * value that exists only here is silently discarded on save.
 */

/**
 * The badge on a card — what kind of session this was.
 *
 * The same three values the event form offers, because they describe the same
 * thing; the backend validates `Recordings.format` against its own `EVENT_TYPES`
 * and rejects anything else, so a value invented here fails on save. A
 * recording with no format has no badge.
 */
export const RECORDING_FORMATS = ["Workshop", "Hackathon", "Teardown"] as const;

/**
 * The content section renders itself from this list.
 *
 * That is the whole point of `content` being one JSONB column: adding
 * "Prerequisites" later should be one entry here plus one in the backend
 * constant, with no migration and no new form component. Hand-writing a card
 * per block would work today and re-open this file every time.
 */
export type ContentBlock = {
  key: "whatYouWillLearn" | "whyThisMatters";
  label: string;
  help?: string;
  placeholder?: string;
};

export const CONTENT_BLOCKS: ContentBlock[] = [
  {
    key: "whatYouWillLearn",
    label: "What you'll learn",
    help: "Rich text \u2014 headings, bulleted or numbered lists, links, bold and italic.",
    placeholder: "Use a bulleted list, or write it as prose. Whatever reads best.",
  },
  {
    key: "whyThisMatters",
    label: "Why this topic matters",
    help: "Rich text \u2014 same tools.",
    placeholder: "Why should somebody spend an hour on this?",
  },
];

/**
 * Defaults mirroring `RECORDING_SETTINGS_DEFAULTS`.
 *
 * A recording saved before a switch existed stores `{}` for it, and the backend
 * resolver layers these underneath — so the form must show the default rather
 * than an unchecked box, or an admin sees "off" for something that is on.
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
