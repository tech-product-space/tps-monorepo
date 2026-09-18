"use client";

import { useState, useEffect, useCallback } from "react";
import { useBlogStore } from "@/gradient/lib/store/useBlogStore";
import { blogService, BlogResponse } from "@/gradient/services/blogService";
import AddBlog from "./AddBlog/AddBlog";
import BlogTable from "./BLogTable/BlogTable";

export default function BlogPage() {
  const { showCreateForm } = useBlogStore();
  const [blogs, setBlogs] = useState<BlogResponse[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);

  const fetchBlogs = useCallback(async () => {
    setFetchLoading(true);
    try {
      const data = await blogService.getAllBlogs();
      if (data.success) {
        setBlogs(data.data);
      }
    } catch (error) {
      console.error("Error fetching blogs:", error);
    } finally {
      setFetchLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlogs();
  }, [fetchBlogs]);

  return (
    <div className="space-y-8">
      {showCreateForm && <AddBlog onSuccess={fetchBlogs} />}
      <BlogTable
        blogs={blogs}
        fetchBlogs={fetchBlogs}
        fetchLoading={fetchLoading}
      />
    </div>
  );
}
