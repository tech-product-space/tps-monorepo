import EnrollmentDetailPage from "@/components/Pages/Common/workflows/EnrollmentDetailPage";

const Page = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return <EnrollmentDetailPage enrollmentId={id} />;
};

export default Page;
