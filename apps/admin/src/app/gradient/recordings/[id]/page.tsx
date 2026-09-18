import RecordingEditor from "@/gradient/components/Pages/RecordingPage/RecordingEditor";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <RecordingEditor recordingId={id} />;
}
