import { Suspense } from "react";
import ManageCoursePage from "@/gradient/components/Pages/CoursePage/ManageCoursePage/ManageCoursePage";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // useSearchParams drives the tab state, so the client tree needs a boundary.
  return (
    <Suspense>
      <ManageCoursePage courseId={id} />
    </Suspense>
  );
}
