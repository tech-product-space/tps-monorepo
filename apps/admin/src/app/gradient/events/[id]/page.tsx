import EventEditor from "@/gradient/components/Pages/EventPage/EventEditor/EventEditor";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <EventEditor eventId={id} />;
}
