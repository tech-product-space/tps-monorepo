import ManageEventPage from "@/gradient/components/Pages/EventPage/ManageEventPage/ManageEventPage";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ManageEventPage eventId={id} />;
}
