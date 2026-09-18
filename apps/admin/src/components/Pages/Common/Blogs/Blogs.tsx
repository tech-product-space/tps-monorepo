"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import BlogsTable from "./BlogsTable/BlogsTable";
import Pagination, { IPaginationMeta } from "@/components/ui/custom/Pagination";
import { getBlogs } from "@/services/blog/blogService";
import BlogV2CreateDialog from "./v2/BlogV2CreateDialog";

interface Blog {
  id: string;
  title: string;
  author: string;
  publishedDate: Date;
  category: string;
  url: string;
  placement: string;
  featured: boolean;
  recommended: boolean;
  type: "publish" | "draft";
  thumbnailSrc: string;
  scheduledAt:string | null
  version: number;
}

interface BlogsProps {
  placement?: string;
  routeSegment?: string;
  heading?: string;
  addLabel?: string;
}

export default function Blogs({
  placement = "blog",
  routeSegment = "blogs",
  heading = "Blogs",
  addLabel = "Add Blog",
}: BlogsProps) {
  // pagination state
  const [meta, setMeta] = useState<IPaginationMeta>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  // keep the latest search term available to pagination/refresh callbacks
  const searchRef = useRef("");

  // fetch function using service file
  const fetchBlogs = useCallback(
    async (page = 1, limit = 10, searchTerm = searchRef.current) => {
      setLoading(true);

    try {
      const json = await getBlogs(page, limit, placement, searchTerm);

      // Expecting { success, data, meta }
      const rows = json.data ?? [];
      const receivedMeta = json.meta;

      const formattedBlogs = rows.map((b: any) => ({
        id: b.blog_id?.toString() ?? b.id?.toString() ?? "",
        title: b.title ?? "",
        author: b.author ?? "",
        publishedDate: b.publishedDate ? new Date(b.publishedDate) : new Date(),
        category: b.category ?? "",
        url: b.url ?? "",
        placement: b.placement ?? "blog",
        thumbnailSrc: b.thumbnailSrc ?? "",
        featured: !!b.featured,
        recommended: !!b.recommended,
        type: b.type ?? "publish",
        scheduledAt: b.scheduledAt ?? null,
        version: Number(b.version) || 1,
      }));

      setBlogs(formattedBlogs);

      setMeta({
        total: receivedMeta?.total ?? 0,
        page: receivedMeta?.page ?? page,
        limit: receivedMeta?.limit ?? limit,
        totalPages:
          receivedMeta?.totalPages ??
          Math.ceil((receivedMeta?.total ?? 0) / limit),
        hasNextPage: receivedMeta?.hasNextPage ?? false,
        hasPrevPage: receivedMeta?.hasPrevPage ?? false,
      });
    } catch (err) {
      console.error("Failed to fetch blogs paginated", err);
    } finally {
      setLoading(false);
    }
  },
    [placement],
  );

  // initial load
  useEffect(() => {
    fetchBlogs(meta.page, meta.limit);
  }, []);

  // debounce search: reset to page 1 and refetch when the term settles.
  // Skip the first run so we don't duplicate the initial load above.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const handle = setTimeout(() => {
      searchRef.current = search;
      fetchBlogs(1, meta.limit, search);
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // New blogs use the v2 (Tiptap) editor. The dialog creates a draft, then
  // redirects to the v2 edit page. Existing v1 blogs stay on /edit.
  const handleAddClick = () => setAddOpen(true);

  // pagination handlers
  const handlePageChange = (newPage: number) => {
    fetchBlogs(newPage, meta.limit);
  };

  const handleLimitChange = (newLimit: number) => {
    fetchBlogs(1, newLimit);
  };

  // refresh after delete or toggle
  const refresh = () => fetchBlogs(meta.page, meta.limit);

  return (
    <div className="flex flex-col h-screen">
      <div className="px-5 h-16 flex justify-between items-center gap-3 border-b">
        <p className="text-lg font-semibold shrink-0">{heading}</p>

        <div className="flex items-center gap-3">
          <div className="relative w-64 max-w-[60vw]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, author, category, slug"
              className="pl-8 pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Button
            className="px-4 py-2 text-sm font-medium cursor-pointer flex items-center gap-2 shrink-0"
            onClick={handleAddClick}
          >
            <Plus />
            {addLabel}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5 pb-0">
        <BlogsTable
          blogs={blogs}
          onRefresh={refresh}
          loading={loading}
          routeSegment={routeSegment}
        />
      </div>
      <div className="p-4">
        <Pagination
          meta={meta}
          onPageChange={handlePageChange}
          onLimitChange={handleLimitChange}
        />
      </div>

      <BlogV2CreateDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        placement={placement}
        routeSegment={routeSegment}
      />
    </div>
  );
}
