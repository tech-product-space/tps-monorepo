"use client";
import { useParams } from "next/navigation";
import BlogV2Editor from "@/components/Pages/Common/Blogs/v2/BlogV2Editor";

const page = () => {
  const { id } = useParams<{ id: string }>();
  return <BlogV2Editor blogId={id} routeSegment="landing-blogs" />;
};

export default page;
