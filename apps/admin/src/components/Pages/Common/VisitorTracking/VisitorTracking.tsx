"use client";

import React, { useEffect, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Eye, Loader2, Search, X } from "lucide-react";
import Pagination, { IPaginationMeta } from "@/components/ui/custom/Pagination";
import {
  exportVisitorNotification,
  getUnreadNotificationCount,
  getVisitors,
  markVisitorAsRead,
} from "@/services/visitorTracking/visitorTracking";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useAuth } from "@/helpers/AuthContext";
import useVisitorNotifications from "./hooks/useVisitorNotifications";
import { formatCount } from "@/utils/helpers";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDataTime } from "@/utils/formatDataTime";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as XLSX from "xlsx";

interface VisitorType {
  id: number;
  visitorId: string;
  name: string;
  email: string;
  phone: string;
  page: string;
  isRead: boolean;
  timestamp: string;
}

const PAGE_OPTIONS = [
  { value: "all", label: "All Pages" },
  { value: "/", label: "Home" },
  { value: "/product-management-fellowship*", label: "PM Fellowship" },
  { value: "/advanced-ai-program*", label: "Advanced AI Program" },
  { value: "/generative-ai-program*", label: "Generative AI Program" },
  {
    value: "/product-management-interview-preparation*",
    label: "PM Interview Prep",
  },
  { value: "/ai-builders-101*", label: "AI Builder 101" },
  { value: "/events*", label: "Events" },
  { value: "/blogs*", label: "Blogs" },
  { value: "/resources*", label: "Resources" },
  { value: "other", label: "Other Pages" },
];

const IgnorePatterns = PAGE_OPTIONS.map((f) => f.value)
  .filter((v) => v !== "all" && v !== "other")
  .join(",");

export default function VisitorTracking() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [visitors, setVisitors] = useState<VisitorType[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(false);

  // Initialize state from URL params
  const [searchTerm, setSearchTerm] = useState(
    searchParams.get("search") || "",
  );
  const [readFilter, setReadFilter] = useState<"all" | "read" | "unread">(
    (searchParams.get("status") as "all" | "read" | "unread") || "all",
  );
  const [pageFilter, setPageFilter] = useState<string>(
    searchParams.get("pageUrl") || "all",
  );
  const [meta, setMeta] = useState<IPaginationMeta>({
    total: 0,
    page: parseInt(searchParams.get("page") || "1"),
    limit: parseInt(searchParams.get("limit") || "20"),
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const [downloadOpen, setDownloadOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [downloading, setDownloading] = useState(false);

  // Update URL with current state
  const updateURL = (params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    pageUrl?: string;
  }) => {
    const newParams = new URLSearchParams(searchParams.toString());

    if (params.page !== undefined) {
      newParams.set("page", params.page.toString());
    }
    if (params.limit !== undefined) {
      newParams.set("limit", params.limit.toString());
    }
    if (params.search !== undefined) {
      if (params.search) {
        newParams.set("search", params.search);
      } else {
        newParams.delete("search");
      }
    }
    if (params.status !== undefined) {
      if (params.status !== "all") {
        newParams.set("status", params.status);
      } else {
        newParams.delete("status");
      }
    }
    if (params.pageUrl !== undefined) {
      if (params.pageUrl !== "all") {
        newParams.set("pageUrl", params.pageUrl);
      } else {
        newParams.delete("pageUrl");
      }
    }

    router.replace(`?${newParams.toString()}`, { scroll: false });
  };

  // Fetch visitors
  const fetchVisitors = async (
    page = 1,
    limit = 20,
    search = "",
    readStatus = "all",
    pageUrl = "all",
  ) => {
    try {
      setLoading(true);
      const response = await getVisitors({
        page,
        limit,
        search: search.trim(),
        readStatus,
        pageUrl: pageUrl === "all" ? undefined : pageUrl,
        ignorePatterns: IgnorePatterns,
      });

      setVisitors(response.data.data);
      setMeta(response.data.meta);
    } catch (error) {
      console.error("Failed to fetch visitors:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const data = await getUnreadNotificationCount();
      if (data.success) setUnreadCount(data.unreadCount);
    } catch (error) {
      console.error("Failed to fetch unread count:", error);
    }
  };

  // Mark as read + navigate
  const handleViewVisitor = (visitor: VisitorType) => {
    if (!visitor.isRead) {
      markVisitorAsRead({ notificationId: visitor.id }).catch((error) => {
        console.error("Failed to mark visitor as read:", error);
      });

      setVisitors((prevVisitors) =>
        prevVisitors.map((v) =>
          v.id === visitor.id ? { ...v, isRead: true } : v,
        ),
      );
    }

    router.push(`visitor/${visitor.visitorId}`);
  };

  // Initial load from URL params
  useEffect(() => {
    fetchVisitors(meta.page, meta.limit, searchTerm, readFilter, pageFilter);
    fetchUnreadCount();
    setInitialized(true);
  }, []);

  // Debounce search & filter
  useEffect(() => {
    if (!initialized) return;

    const delayDebounce = setTimeout(() => {
      fetchVisitors(1, meta.limit, searchTerm, readFilter, pageFilter);
      updateURL({
        page: 1,
        limit: meta.limit,
        search: searchTerm,
        status: readFilter,
        pageUrl: pageFilter,
      });
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm, readFilter, pageFilter]);

  useVisitorNotifications({
    id: user?.email ?? null,
    onNewNotification: (visitor: VisitorType) => {
      setUnreadCount((c) => c + 1);

      if (meta.page === 1 && readFilter !== "read") {
        setVisitors((prev) => [visitor, ...prev].slice(0, meta.limit));
      }
    },
  });

  // Pagination handlers
  const handlePageChange = (newPage: number) => {
    fetchVisitors(newPage, meta.limit, searchTerm, readFilter, pageFilter);
    updateURL({
      page: newPage,
      limit: meta.limit,
      search: searchTerm,
      status: readFilter,
      pageUrl: pageFilter,
    });
  };

  const handleLimitChange = (newLimit: number) => {
    fetchVisitors(1, newLimit, searchTerm, readFilter, pageFilter);
    updateURL({
      page: 1,
      limit: newLimit,
      search: searchTerm,
      status: readFilter,
      pageUrl: pageFilter,
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
  };

  const handleFilterChange = (filter: "all" | "read" | "unread") => {
    setReadFilter(filter);
  };

  const handlePageFilterChange = (value: string) => {
    setPageFilter(value);
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);

      // 1. Call backend to get full filtered data
      const response = await exportVisitorNotification({
        search: searchTerm.trim(),
        readStatus: readFilter,
        pageUrl: pageFilter === "all" ? undefined : pageFilter,
        ignorePatterns: IgnorePatterns,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });

      const rows: VisitorType[] = response.data.data;

      if (!rows.length) {
        alert("No data found for the selected filters.");
        return;
      }

      // 2. Transform data for Excel
      const exportRows = rows.map((v) => ({
        "Visitor ID": v.visitorId,
        Name: v.name,
        Email: v.email,
        Phone: v.phone,
        Page: v.page,
        Time: v.timestamp,
        Status: v.isRead ? "Read" : "Unread",
      }));

      // 3. Build Excel workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportRows);

      XLSX.utils.book_append_sheet(wb, ws, "Visitors");

      // 4. Download the file
      XLSX.writeFile(wb, `visitor_export_${Date.now()}.xlsx`);
      setDownloadOpen(false);
    } catch (error) {
      console.error(error);
      alert("Failed to export file.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-5 h-16 flex justify-between items-center border-b bg-white ">
        <div className="flex items-center gap-2">
          <SidebarTrigger size={"lg"} />
          <p className="text-lg font-semibold">Visitors Tracking</p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="visitor-tracking/blocked-users">
            <Button variant="outline">Blocked Users</Button>
          </Link>

          <Button onClick={() => setDownloadOpen(true)}>
            <Download className="h-4 w-4" />
            Download
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-4 bg-white border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search by visitorId, name, email, phone..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="pl-9 pr-9 w-full bg-gray-50 border-gray-200 focus:bg-white transition-colors"
          />
          {searchTerm && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-3">
          {/* Page Filter */}
          <Select value={pageFilter} onValueChange={handlePageFilterChange}>
            <SelectTrigger className="w-[200px] bg-gray-50 border-gray-200">
              <SelectValue placeholder="Filter by page" />
            </SelectTrigger>
            <SelectContent>
              {PAGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Read/Unread Filter Tabs */}
          <Tabs
            value={readFilter}
            onValueChange={(val) => handleFilterChange(val as any)}
            className="w-auto"
          >
            <TabsList className="grid w-full grid-cols-3 h-9 ">
              <TabsTrigger value="all" className="text-xs px-3 ">
                All
              </TabsTrigger>
              <TabsTrigger value="unread" className="relative text-xs px-3">
                Unread
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-2 bg-red-600 text-white 
                              text-[8px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                  >
                    {formatCount(unreadCount)}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="read" className="text-xs px-3">
                Read
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-gray-50 overflow-auto p-5">
        <div className="rounded-lg shadow">
          {loading ? (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
            </div>
          ) : (
            <Table className="bg-white rounded-md">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {visitors.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-gray-500 py-6"
                    >
                      No visitor activity found
                    </TableCell>
                  </TableRow>
                ) : (
                  visitors.map((v) => (
                    <TableRow
                      key={v.id}
                      onClick={() => handleViewVisitor(v)}
                      className={`cursor-pointer transition-colors ${
                        !v.isRead
                          ? "bg-gray-100 hover:bg-gray-200"
                          : "text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      <TableCell className="capitalize">
                        {!v.isRead && (
                          <span className="inline-block h-2 w-2 rounded-full bg-blue-500 mr-2"></span>
                        )}
                        {v.name}
                      </TableCell>
                      <TableCell>{v.email}</TableCell>
                      <TableCell>{v.phone}</TableCell>
                      <TableCell className="text-xs text-gray-600 max-w-[180px] truncate">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help inline-block max-w-[180px] truncate">
                                {v.page}
                              </span>
                            </TooltipTrigger>

                            <TooltipContent className="max-w-xs break-all">
                              {v.page}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell>{formatDataTime(v.timestamp)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Pagination */}
      <div className="p-4">
        <Pagination
          meta={meta}
          onPageChange={handlePageChange}
          onLimitChange={handleLimitChange}
        />
      </div>

      {/* Download Dialog */}
      <Dialog
        open={downloadOpen}
        onOpenChange={(open) => {
          setDownloadOpen(open);
          if (!open) {
            // Reset fields on close
            setDateFrom("");
            setDateTo("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Download Visitor Data</DialogTitle>
            <DialogDescription>
              Export visitor activity based on your current filters.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">From Date</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">To Date</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDownloadOpen(false)}
              disabled={downloading}
            >
              Cancel
            </Button>
            <Button onClick={handleDownload} disabled={downloading}>
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
