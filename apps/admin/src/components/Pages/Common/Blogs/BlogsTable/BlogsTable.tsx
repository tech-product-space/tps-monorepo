"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Clock,
  Copy,
  Edit,
  EllipsisVertical,
  LucideClockFading,
  Pencil,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  cancelSchedulePublish,
  deleteBlog,
  schedulePublish,
  toggleFeaturedStatus,
  toggleRecommendedStatus,
  updateBlogPublishStatus,
} from "@/services/blog/blogService";
import { useNotification } from "@/helpers/NotificationContext";
import { useRouter } from "next/navigation";
import {
  starIcon,
  starIconFilled,
  thumbsIcon,
  thumbsIconFilled,
} from "@/utils/svgIcons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import LoadingSpinner from "@/components/Common/Loading/HoverLoading";
import Cookies from "js-cookie";
import { formatDataTime } from "@/utils/formatDataTime";
import { Input } from "@/components/ui/input";

interface Blog {
  id: string;
  title: string;
  author: string;
  publishedDate: Date;
  category: string;
  url: string;
  placement: string;
  featured: boolean;
  type: "publish" | "draft";
  recommended: boolean;
  thumbnailSrc: string;
  scheduledAt: string | null;
  version: number;
}

// Public site base + slug helpers — kept in sync with the public site's
// getBlogUrl(): " & " -> " and " so category slugs never contain a raw "&".
const SITE_URL =
  process.env.NEXT_PUBLIC_WEBSITE_URL || "https://theproductspace.in";

const slugify = (value?: string) =>
  (value || "").toLowerCase().trim().replace(/\s+/g, "-");

const slugifyCategory = (value?: string) =>
  (value || "")
    .toLowerCase()
    .trim()
    .replace(/ & /g, " and ")
    .replace(/\s+/g, "-");

// Build the public URL for a blog. Standalone "Landing Blogs" live at
// /<category>/<slug>; regular blogs under /blogs/<category>/<slug>.
const getPublicBlogUrl = (blog: Blog) => {
  const cat = slugifyCategory(blog.category);
  const slug = slugify(blog.url);
  const path =
    blog.placement === "standalone"
      ? `/${cat}/${slug}`
      : `/blogs/${cat}/${slug}`;
  return `${SITE_URL}${path}`;
};

export default function BlogsTable({
  blogs,
  onRefresh,
  loading,
  routeSegment = "blogs",
}: {
  blogs: Blog[];
  onRefresh: () => void;
  loading?: boolean;
  routeSegment?: string;
}) {
  const { showNotification } = useNotification();
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [blogToDelete, setBlogToDelete] = useState<string | null>(null);
  const [loadingFeatured, setLoadingFeatured] = useState<
    Record<string, boolean>
  >({});
  const [loadingRecommended, setLoadingRecommended] = useState<
    Record<string, boolean>
  >({});

  const role = Cookies.get("currentRole");
  const [selectedBlogId, setSelectedBlogId] = useState<string | null>(null);
  const [selectedBlogStatus, setSelectedBlogStatus] = useState<
    "publish" | "draft"
  >("draft");
  const [isBlogPublishOpen, setIsBlogPublishOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleBlogId, setScheduleBlogId] = useState<string | null>(null);
  const [publishAt, setPublishAt] = useState<string>("");
  const handleEdit = (blogId: string, version: number) => {
    // v2 blogs use the new Tiptap editor; v1 stays on the legacy editor.
    const segment = version === 2 ? "edit-v2" : "edit";
    router.push(`/${role}/${routeSegment}/${segment}/${blogId}`);
  };

  const handleDelete = (blogId: string) => {
    setBlogToDelete(blogId);
    setDeleteDialogOpen(true);
  };

  const handleCopyUrl = async (blog: Blog) => {
    try {
      await navigator.clipboard.writeText(getPublicBlogUrl(blog));
      showNotification("success", "Copied", "Blog URL copied to clipboard");
    } catch {
      showNotification("error", "Copy failed", "Could not copy the URL");
    }
  };

  const confirmDelete = async () => {
    if (!blogToDelete) return;
    try {
      const res = await deleteBlog(blogToDelete);
      showNotification("success", "Action Successful", res.message, {
        label: "Close",
        onClick: () => console.log("Close clicked"),
      });
      // refresh parent
      onRefresh();
    } catch (err) {
      console.error("Delete error", err);
      showNotification("error", "Action Failed", "Unable to delete blog");
    } finally {
      setDeleteDialogOpen(false);
      setBlogToDelete(null);
    }
  };

  const toggleRecommended = async (blogId: string) => {
    setLoadingRecommended((p) => ({ ...p, [blogId]: true }));
    try {
      const res = await toggleRecommendedStatus(blogId);
      showNotification("success", "Action Successful", res.message, {
        label: "Close",
        onClick: () => console.log("Close clicked"),
      });
      onRefresh();
    } catch (err) {
      console.error("Failed to toggle recommended:", err);
      showNotification(
        "error",
        "Action Failed",
        "Unable to toggle recommended",
      );
    } finally {
      setLoadingRecommended((p) => ({ ...p, [blogId]: false }));
    }
  };

  const toggleFeatured = async (blogId: string) => {
    setLoadingFeatured((p) => ({ ...p, [blogId]: true }));
    try {
      const res = await toggleFeaturedStatus(blogId);
      showNotification("success", "Action Successful", res.message, {
        label: "Close",
        onClick: () => console.log("Close clicked"),
      });
      onRefresh();
    } catch (err) {
      console.error("Failed to toggle featured:", err);
      showNotification("error", "Action Failed", "Unable to toggle featured");
    } finally {
      setLoadingFeatured((p) => ({ ...p, [blogId]: false }));
    }
  };

  const publishBlogFn = async (blogId: string, status: "publish" | "draft") => {
    try {
      await updateBlogPublishStatus(blogId, status);
      setIsBlogPublishOpen(false);
      onRefresh();
    } catch (error) {
      console.error("Update failed:", error);
    }
  };

  const handleSchedulePublish = async () => {
    if (!scheduleBlogId || !publishAt) return;
    console.log("Time : ", publishAt);
    try {
      await schedulePublish(scheduleBlogId, new Date(publishAt).toISOString());

      showNotification(
        "success",
        "Scheduled",
        "Blog Publish Scheduled Successfully",
      );

      setIsScheduleOpen(false);
      setScheduleBlogId(null);
      setPublishAt("");
      onRefresh();
    } catch (error) {
      console.error("Schedule failed:", error);
      showNotification(
        "error",
        "Action Failed",
        "Unable to schedule blog publish",
      );
    }
  };

  const handleCancelSchedule = async (blogId: string) => {
    try {
      const res = await cancelSchedulePublish(blogId);

      showNotification(
        "success",
        "Action Successful",
        res.message || "Blog Schedule Cancelled Successfully",
        {
          label: "Close",
          onClick: () => console.log("Close clicked"),
        },
      );

      onRefresh();
    } catch (error: any) {
      console.error("Cancel schedule failed:", error);

      showNotification(
        "error",
        "Action Failed",
        error?.response?.data?.message || "Unable to cancel blog schedule",
      );
    }
  };

  const getMinDateTime = () => {
    const now = new Date();
    now.setSeconds(0, 0);
    return now.toISOString().slice(0, 16);
  };

  return (
    <div className="w-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="font-bold text-base">Thumbnail</TableHead>
            <TableHead className="font-bold text-base">Title</TableHead>
            <TableHead className="font-bold text-base">Author</TableHead>
            <TableHead className="font-bold text-base">Category</TableHead>
            <TableHead className="font-bold text-base">Status</TableHead>
            <TableHead className="text-right font-bold text-base">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {blogs.map((blog) => (
            <TableRow
              key={blog.id}
              className={`${blog.type === "draft" ? "bg-green-50" : ""}`}
            >
              <TableCell>
                <img
                  src={blog.thumbnailSrc}
                  alt={blog.id}
                  className="h-16 rounded-md border"
                />
              </TableCell>

              <TableCell className="max-w-[200px] truncate">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            blog.version === 2
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {blog.version === 2 ? "V2" : "V1"}
                        </span>
                        {blog.title}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{blog.title}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableCell>

              <TableCell>{blog.author}</TableCell>
              <TableCell className="capitalize">{blog.category}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2 text-sm">
                  {blog.scheduledAt && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Clock className="h-4 w-4 text-orange-400 shrink-0 cursor-pointer" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            Scheduled for {formatDataTime(blog.scheduledAt)}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {blog.type === "publish" ? (
                    <p className="px-2 py-1 rounded-lg w-20 text-center bg-green-100 text-green-800">
                      Published
                    </p>
                  ) : (
                    <p className="px-2 py-1 rounded-lg w-20 text-center bg-orange-100 text-orange-800">
                      Draft
                    </p>
                  )}

                  <Pencil
                    size={16}
                    className="cursor-pointer text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setSelectedBlogId(blog.id);
                      setSelectedBlogStatus(blog.type);
                      setIsBlogPublishOpen(true);
                    }}
                  />
                </div>
              </TableCell>

              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => toggleRecommended(blog.id)}
                  >
                    {loadingRecommended[blog.id] ? (
                      <LucideClockFading className="animate-spin" />
                    ) : blog.recommended ? (
                      thumbsIconFilled
                    ) : (
                      thumbsIcon
                    )}
                    <span className="sr-only">Toggle Recommended</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => toggleFeatured(blog.id)}
                  >
                    {loadingFeatured[blog.id] ? (
                      <LucideClockFading className="animate-spin" />
                    ) : blog.featured ? (
                      starIconFilled
                    ) : (
                      starIcon
                    )}
                    <span className="sr-only">Toggle Featured</span>
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger className="cursor-pointer">
                      <EllipsisVertical size={20} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        onClick={() => handleEdit(blog.id, blog.version)}
                      >
                        <Edit className="h-4 w-4" />
                        <span>Edit</span>
                      </DropdownMenuItem>

                      <DropdownMenuItem onClick={() => handleCopyUrl(blog)}>
                        <Copy className="h-4 w-4" />
                        <span>Copy URL</span>
                      </DropdownMenuItem>

                      {blog.scheduledAt == null && (
                        <DropdownMenuItem
                          onClick={() => {
                            setScheduleBlogId(blog.id);
                            setPublishAt("");
                            setIsScheduleOpen(true);
                          }}
                        >
                          <Clock className="h-4 w-4" />
                          <span>Schedule</span>
                        </DropdownMenuItem>
                      )}

                      {blog.scheduledAt && (
                        <DropdownMenuItem
                          onClick={() => handleCancelSchedule(blog.id)}
                        >
                          <XCircle className="text-red-600 h-4 w-4" /> Cancel
                          Schedule
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuItem onClick={() => handleDelete(blog.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          ))}

          {blogs.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center py-8 text-muted-foreground"
              >
                {loading ? <LoadingSpinner /> : "No blogs found"}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              blog post.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isBlogPublishOpen} onOpenChange={setIsBlogPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will{" "}
              {selectedBlogStatus === "publish" ? "unpublish" : "publish"} the
              blog.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>

            <AlertDialogAction
              onClick={() => {
                if (selectedBlogId !== null) {
                  const nextStatus =
                    selectedBlogStatus === "publish" ? "draft" : "publish";

                  publishBlogFn(selectedBlogId, nextStatus);
                }
              }}
              className={`text-white ${
                selectedBlogStatus === "publish"
                  ? "bg-orange-600 hover:bg-orange-700"
                  : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {selectedBlogStatus === "publish" ? "Draft" : "Publish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Schedule Blog Publish</AlertDialogTitle>
            <AlertDialogDescription>
              Select the date and time when this blog should be published.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            <label className="block text-sm font-medium mb-2">
              Publish Date & Time
            </label>

            <Input
              id="date"
              type="datetime-local"
              value={publishAt}
              min={getMinDateTime()}
              onChange={(e) => setPublishAt(e.target.value)}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSchedulePublish}
              disabled={!publishAt}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Schedule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
