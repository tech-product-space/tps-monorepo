import FreeCourseEditor from "@/gradient/components/Pages/FreeCoursePage/FreeCourseEditor/FreeCourseEditor";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <FreeCourseEditor courseId={id} />;
}
