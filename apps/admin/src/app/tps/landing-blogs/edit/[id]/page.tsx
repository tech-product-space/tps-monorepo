"use client";
import EditBlog from "@/components/Pages/Common/Blogs/Add&EditBlog/EditBlog";

const page = () => {
  return (
    <EditBlog
      placement="standalone"
      routeSegment="landing-blogs"
      heading="Edit Landing Blog"
    />
  );
};

export default page;
