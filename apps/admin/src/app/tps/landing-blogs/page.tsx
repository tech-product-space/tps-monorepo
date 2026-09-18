"use client";
import Blogs from "@/components/Pages/Common/Blogs/Blogs";

const page = () => {
  return (
    <Blogs
      placement="standalone"
      routeSegment="landing-blogs"
      heading="Landing Blogs"
      addLabel="Add Landing Blog"
    />
  );
};

export default page;
