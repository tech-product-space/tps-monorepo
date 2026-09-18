import { redirect } from "next/navigation";

/**
 * Marketing is a sidebar group, not a page of its own — Campaigns and Contacts
 * are separate routes. This keeps old links and bookmarks (including the
 * `?tab=` ones the tabbed version produced) landing somewhere sensible.
 */
export default function Page() {
    redirect("/marketing/campaigns");
}
