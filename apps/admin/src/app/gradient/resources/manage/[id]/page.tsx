import ManageResourcePage from "@/gradient/components/Pages/ResourcePage/ManageResourcePage/ManageResourcePage";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ManageResourcePage resourceId={id} />;
}
