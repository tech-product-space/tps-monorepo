import { createRecordingPreviewToken } from "@/services/recordings/recordingsService";
import { createLessonPreviewToken } from "@/services/courses/lessons";

/**
 * Opens content on the public site with the publish filters lifted.
 *
 * The tab is opened **before** the token is fetched, and navigated afterwards.
 * That ordering is not stylistic: `window.open` outside the click handler's
 * user gesture is what a popup blocker exists to stop, and awaiting the mint
 * first puts it there. Opening synchronously keeps the gesture, at the cost of
 * a blank tab for the moment the request takes.
 *
 * The path is built from the slug the API returns, never from the slug held in
 * the editor. They differ for exactly as long as it takes somebody to rename
 * something and save — and the public site refuses a link whose path and token
 * disagree about which row it is, so a stale slug here reads as "that preview
 * link is for a different recording".
 */

/**
 * The public site's origin, for links out of the panel. Matches
 * `openAiProductPreview`'s fallback.
 *
 * The trailing slash is stripped so callers can always write `${siteUrl()}/x`.
 */
export const siteUrl = (): string =>
  (process.env.NEXT_PUBLIC_WEBSITE_URL || "https://theproductspace.in").replace(
    /\/$/,
    ""
  );

/**
 * Preview a session recording.
 *
 * What this buys, over pasting the public URL into a tab: the page renders at
 * all before the recording is published or before its scheduled date, and the
 * video plays without anybody putting a real address through the lead gate —
 * which on this site would also mean holding a *website* account, separate from
 * the panel login.
 *
 * Resolves to false when the mint failed, so the caller can say so in its own
 * notification system rather than this reaching for one.
 */
export const openRecordingPreview = async (
  recordingId: string
): Promise<boolean> => {
  const tab = window.open("", "_blank");

  try {
    const response = await createRecordingPreviewToken(recordingId);
    const { token, slug } = response?.data ?? {};

    if (!token || !slug) throw new Error("No token returned");

    const url = `${siteUrl()}/api/preview?token=${encodeURIComponent(
      token
    )}&redirect=${encodeURIComponent(`/recordings/${slug}`)}`;

    // The blocker may have refused the tab anyway. Falling back to this tab is
    // better than doing nothing and looking broken.
    if (tab) tab.location.href = url;
    else window.location.href = url;

    return true;
  } catch {
    tab?.close();
    return false;
  }
};

/**
 * Preview a free-course lesson on the public site.
 *
 * What this buys, over pasting the public URL into a tab: the page renders at
 * all. A lesson being written is a draft, usually inside a module that is also
 * a draft, and the player is behind a sign-in *and* an enrolment gate — so
 * without this there is no way to read a lesson the way a learner will until it
 * is already live.
 *
 * The path is built from the slugs the API returns, never from the ones held in
 * the editor: rename a lesson, module or course and save, and the two disagree
 * until the editor reloads. The public site refuses a link whose path and token
 * disagree about which row it is.
 *
 * Resolves to false when the mint failed, so the caller can say so in its own
 * notification system rather than this reaching for one.
 */
export const openLessonPreview = async (
  lessonId: string
): Promise<boolean> => {
  const tab = window.open("", "_blank");

  try {
    const response = await createLessonPreviewToken(lessonId);
    const { token, slug, moduleSlug, courseSlug } = response?.data ?? {};

    if (!token || !slug || !moduleSlug || !courseSlug) {
      throw new Error("No token returned");
    }

    const path = `/free-courses/${courseSlug}/${moduleSlug}/${slug}`;
    const url = `${siteUrl()}/api/preview?token=${encodeURIComponent(
      token
    )}&redirect=${encodeURIComponent(path)}`;

    if (tab) tab.location.href = url;
    else window.location.href = url;

    return true;
  } catch {
    tab?.close();
    return false;
  }
};
