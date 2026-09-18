import BlogEditor from "@/gradient/components/Pages/BlogPage/BlogEditor/BlogEditor";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <BlogEditor blogId={id} />;
}