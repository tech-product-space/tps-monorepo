"use client";
import AddBlog from "@/components/Pages/Common/Blogs/Add&EditBlog/AddBlog";

const page = () => {
  return (
    <AddBlog
      placement="standalone"
      routeSegment="landing-blogs"
      heading="Add Landing Blog"
    />
  );
};

export default page;
