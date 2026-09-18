// Extracted from renderers/YoutubeBlock so non-React callers (the lesson content
// importer) can validate a URL against the same logic the renderer uses, rather
// than keeping a second copy of these patterns in sync.
// YoutubeBlock re-exports both for its existing importers.

export function extractYoutubeId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

export function buildYoutubeEmbedUrl(
  url: string,
  opts: { loop?: boolean; autoplay?: boolean } = {},
): string | null {
  const id = extractYoutubeId(url);
  if (!id) return null;
  const params = new URLSearchParams();
  if (opts.autoplay) {
    params.set("autoplay", "1");
    params.set("mute", "1"); // required by browser autoplay policy
    params.set("playsinline", "1");
  }
  if (opts.loop) {
    params.set("loop", "1");
    params.set("playlist", id);
  }
  const qs = params.toString();
  return `https://www.youtube.com/embed/${id}${qs ? `?${qs}` : ""}`;
}
