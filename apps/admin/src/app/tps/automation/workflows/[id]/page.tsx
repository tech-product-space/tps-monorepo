import WorkflowDetailPage from "@/components/Pages/Common/workflows/WorkflowDetailPage";

const Page = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return <WorkflowDetailPage workflowId={id} />;
};

export default Page;
