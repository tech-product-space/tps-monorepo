/**
 * Parses a YouTube URL to its video id, so the editor can show the admin what
 * it read back and preview the embed before saving.
 *
 * The API parses independently and is the authority — it refuses what it cannot
 * read rather than storing null. This copy exists purely so the feedback is
 * immediate; never send `videoId` to the server.
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
    // A pasted "youtu.be/abc" has no scheme, and rejecting it would look like
    // the field is broken.
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

export const youTubeThumbnail = (videoId: string) =>
  `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
