import { redirect } from "next/navigation";

/**
 * Modules used to live on their own page, disconnected from the course editor.
 * They are now a tab inside the course workspace — keep this route working for
 * bookmarks and any links that still point here.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  redirect(`/free-courses/${id}?tab=curriculum`);
}
