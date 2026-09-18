import { toast } from "sonner";

import { siteUrl } from "@/gradient/lib/site";
import { freeCourseService } from "@/gradient/services/freeCourseService";
import { recordingService } from "@/gradient/services/recordingService";

/**
 * Opens content on the public site with the publish filters lifted.
 * `../FREE_COURSE_PREVIEW_PLAN.md` §6.
 *
 * The tab is opened **before** the token is fetched, and navigated afterwards.
 * That ordering is not stylistic: `window.open` outside the click handler's
 * user gesture is what a popup blocker exists to stop, and awaiting the mint
 * first puts it there. Opening synchronously keeps the gesture, at the cost of
 * a blank tab for the moment the request takes.
 *
 * The path is built from the slug the API returns, never from the slug held in
 * the editor. They differ for exactly as long as it takes an admin to rename
 * something and save — and the public site refuses a link whose path and token
 * disagree about which row it is, so a stale slug here reads as "that preview
 * link is for a different course".
 */

/**
 * The shared half: mint, build, navigate, and say so if any of it fails.
 *
 * `mint` is the only thing that differs between the two kinds — the site reads
 * which API to verify against off the redirect path, so there is no type
 * parameter to keep in step here.
 */
const openPreview = async (
  mint: () => Promise<{ data?: { token?: string; slug?: string } }>,
  buildPath: (slug: string) => string,
): Promise<void> => {
  const tab = window.open("", "_blank");

  try {
    const response = await mint();
    const { token, slug } = response?.data ?? {};

    if (!token || !slug) throw new Error("No token returned");

    const url = `${siteUrl()}/api/preview?token=${encodeURIComponent(
      token,
    )}&redirect=${encodeURIComponent(buildPath(slug))}`;

    // The blocker may have refused the tab anyway. Falling back to this tab is
    // better than doing nothing and looking broken.
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch {
    tab?.close();
    toast.error("Couldn't open the preview. Please try again.");
  }
};

/**
 * @param courseId  course to mint the token for
 * @param buildPath given the course's current slug, the public path to land on
 *                  — the course page, or a lesson inside it
 */
export const openFreeCoursePreview = (
  courseId: string,
  buildPath: (slug: string) => string = (slug) => `/free-courses/${slug}`,
): Promise<void> =>
  openPreview(
    () => freeCourseService.createPreviewToken(courseId),
    buildPath,
  );

/**
 * The same, for a session recording.
 *
 * A recording is one page, so there is no deep link to build and no `buildPath`
 * argument. What preview buys here is two things a draft URL cannot give an
 * admin: the page renders at all before it is published or before its scheduled
 * date, and the video plays without anyone having to put a real address through
 * the lead gate.
 */
export const openRecordingPreview = (recordingId: string): Promise<void> =>
  openPreview(
    () => recordingService.createPreviewToken(recordingId),
    (slug) => `/recordings/${slug}`,
  );
