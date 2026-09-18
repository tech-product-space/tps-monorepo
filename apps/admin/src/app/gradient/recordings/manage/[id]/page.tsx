import ManageRecordingPage from "@/gradient/components/Pages/RecordingPage/ManageRecordingPage/ManageRecordingPage";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ManageRecordingPage recordingId={id} />;
}
