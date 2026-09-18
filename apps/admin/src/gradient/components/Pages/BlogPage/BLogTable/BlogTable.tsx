"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { Badge } from "@/gradient/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/gradient/components/ui/card";
import { Button } from "@/gradient/components/ui/button";
import { CloudCog, Edit, Loader2, RefreshCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BlogResponse, blogService } from "@/gradient/services/blogService";
import { useRouter } from "next/navigation";
import { BlogStatusToggle } from "./ToggleBlogStatus/ToggleBlogStatus";

interface BlogTableProps {
  blogs: BlogResponse[];
  fetchBlogs: () => void;
  fetchLoading: boolean;
}

export default function BlogTable({
  blogs,
  fetchBlogs,
  fetchLoading,
}: BlogTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const router = useRouter();

  const handleEdit = (id: string) => {
    router.push(`/blog/${id}`);
  };

  const handleDelete = (blog: BlogResponse) => {
    toast(`Delete "${blog.title}"?`, {
      description: "This action cannot be undone.",
      duration: 8000,
      action: {
        label: "Delete",
        onClick: () => confirmDelete(blog.id!),
      },
      cancel: {
        label: "Cancel",
        onClick: () => {},
      },
    });
  };

  const confirmDelete = async (id: string) => {
    setDeletingId(id);
    const toastId = toast.loading("Deleting blog post...");
    try {
      await blogService.deleteBlog(id);
      toast.success("Blog post deleted successfully!", { id: toastId });
      fetchBlogs();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to delete blog post.",
        { id: toastId },
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>All Blogs</CardTitle>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchBlogs}
          disabled={fetchLoading}
        >
          <RefreshCcw
            className={`w-4 h-4 ${fetchLoading ? "animate-spin" : ""}`}
          />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Featured</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fetchLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading blogs...
                    </div>
                  </TableCell>
                </TableRow>
              ) : blogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No blog posts found.
                  </TableCell>
                </TableRow>
              ) : (
                blogs.map((blog) => (
                  <TableRow key={blog.id}>
                    <TableCell className="font-medium">
                      <div>
                        <p>{blog.title}</p>
                        <p className="text-xs text-muted-foreground font-normal truncate max-w-75">
                          {blog.subTitle}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{blog.category}</Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(blog?.createdAt || "").toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {blog?.id && blog?.status && (
                        <BlogStatusToggle
                          blogId={blog.id}
                          status={blog.status}
                          refetch={fetchBlogs}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {blog.isFeatured ? (
                        <Badge className="bg-yellow-500 hover:bg-yellow-600 text-black">
                          ⭐ Featured
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Normal</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-primary"
                        onClick={() => handleEdit(blog.id!)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={deletingId === blog.id}
                        onClick={() => handleDelete(blog)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        {deletingId === blog.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
