"use client"
import BlogForm from "./BlogForm";

interface AddBlogProps {
  placement?: string;
  routeSegment?: string;
  heading?: string;
}

const AddBlog = ({
  placement = "blog",
  routeSegment = "blogs",
  heading = "Add Blogs",
}: AddBlogProps) => {
  return (
    <div className="flex flex-col h-screen">
      <div className="px-5 h-16 flex justify-between items-center border-b">
        <p className="text-lg font-semibold">{heading}</p>
      </div>
      <div className="flex flex-col h-full flex-1 overflow-auto">
        <BlogForm placement={placement} routeSegment={routeSegment} />
      </div>
    </div>
  );
};

export default AddBlog;
