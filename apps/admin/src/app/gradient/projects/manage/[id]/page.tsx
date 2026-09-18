"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * The edit form used to live here. It is now a tab on the project itself, so
 * there is one screen per project rather than two.
 *
 * Kept as a redirect rather than deleted: links to /projects/manage/<id> exist
 * in browser history, in the activity log's own navigation, and in anything an
 * admin bookmarked. A 404 for a project that plainly exists is a worse answer
 * than a hop.
 */
export default function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/projects/${id}?tab=Details`);
  }, [id, router]);

  return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
