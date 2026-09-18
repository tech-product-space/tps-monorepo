"use strict";

/**
 * YouTube URL → video id.
 *
 * Lives here rather than only in the admin panel because the panel is not the
 * only thing that can write a recording, and a row saved with `videoId: null`
 * looks fine in every list and is a dead player in production. The API parses
 * what it is given and refuses what it cannot read.
 *
 * A bare 11-character id is accepted so somebody can paste just the id.
 */

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** Path-based forms: /embed/ID, /live/ID, /shorts/ID, /v/ID, youtu.be/ID. */
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

/**
 * @param {string} input a watch URL, share URL, embed URL, or bare id
 * @returns {string|null} the 11-character id, or null if it cannot be read
 */
const parseYouTubeVideoId = (input) => {
  if (typeof input !== "string") return null;

  const value = input.trim();
  if (!value) return null;

  if (ID_PATTERN.test(value)) return value;

  let url;

  try {
    // Tolerate a pasted URL with no scheme — "youtu.be/abc" is a thing people
    // paste, and rejecting it would look like the parser is broken.
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }

  if (!HOSTS.has(url.hostname.toLowerCase())) return null;

  // youtube.com/watch?v=ID, with any number of other params alongside it.
  const queryId = url.searchParams.get("v");
  if (queryId && ID_PATTERN.test(queryId)) return queryId;

  const segments = url.pathname.split("/").filter(Boolean);
  if (!segments.length) return null;

  // youtu.be/ID — the id is the whole path.
  if (url.hostname.toLowerCase().endsWith("youtu.be")) {
    return ID_PATTERN.test(segments[0]) ? segments[0] : null;
  }

  if (PATH_PREFIXES.includes(segments[0]) && segments[1]) {
    return ID_PATTERN.test(segments[1]) ? segments[1] : null;
  }

  return null;
};

/**
 * Normalises whatever the admin submitted into the stored `video` shape.
 *
 * Returns `{ ok: false, message }` rather than throwing or silently nulling —
 * the caller turns it into a 400 so the panel can show it against the field.
 * An empty URL is allowed: a draft recording legitimately has no video yet, and
 * the publish check is what enforces having one.
 *
 * @param {object} input the client's `video` object
 * @param {object} existing the currently stored `video`, for partial updates
 */
const buildVideoBlock = (input, existing = {}) => {
  if (input === undefined) return { ok: true, value: existing };

  const merged = { ...(existing ?? {}), ...(input ?? {}) };
  const url = typeof merged.url === "string" ? merged.url.trim() : "";

  if (!url) {
    return {
      ok: true,
      value: {
        provider: "youtube",
        url: "",
        videoId: null,
        isUnlisted: Boolean(merged.isUnlisted),
      },
    };
  }

  const videoId = parseYouTubeVideoId(url);

  if (!videoId) {
    return {
      ok: false,
      message:
        "That does not look like a YouTube link. Paste a watch, share, or embed URL.",
    };
  }

  return {
    ok: true,
    value: {
      provider: "youtube",
      url,
      videoId,
      isUnlisted: Boolean(merged.isUnlisted),
    },
  };
};

module.exports = { parseYouTubeVideoId, buildVideoBlock };
