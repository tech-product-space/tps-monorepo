"use client";
import React, { useEffect, useMemo, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  BarChart3,
  Download,
  Settings,
  Trash2,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import Pagination, { IPaginationMeta } from "@/components/ui/custom/Pagination";
import { debounce } from "@/utils/debounce";

import {
  getPlatformLeads,
  deletePlatformLeadsById,
  deletePlatformLeadsArray,
  updatePlatformLeadsByStatus,
  updatePlatformLeadsByAssignee,
} from "@/services/Leads/platformLeadServices";

import { GROUPED_TYPES } from "./data/FormTypes";
import { DownloadDialog } from "../Download/Leads-Download";
import PlatformLeadsTable from "./components/PlatformLeadsTable/PlatformLeadsTable";
import type { ILead } from "./types/leads";
import LeadDeleteDialog from "./components/PlatformLeadsTable/LeadDeleteDialog";
import {
  ColumnOrderState,
  RowSelectionState,
  VisibilityState,
} from "@tanstack/react-table";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import SortableColumnItem from "./components/SortableColumnItem";
import { formatDataTime } from "@/utils/formatDataTime";
import LeadDetailsDialog from "./components/LeadsDetailDialog/LeadDetailsDialog";

const COLUMN_CONFIG = [
  { id: "name", label: "Name" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "type", label: "Source" },
  { id: "createdAt", label: "Date & Time" },
  { id: "assignee", label: "Assignee" },
  { id: "status", label: "Status" },
];

const PlatformLeads: React.FC = () => {
  const currentRole = Cookies.get("currentRole");
  const router = useRouter();

  const [data, setData] = useState<ILead[]>([]);

  const [selectedViewLead, setSelectedViewLead] = useState<ILead | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  const [selectedDeleteLead, setSelectedDeleteLead] = useState<ILead | null>(
    null,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);
  const [search, setSearch] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [allTotal, setAllTotal] = useState<number>(0);

  const [meta, setMeta] = useState<IPaginationMeta>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // table states
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const selectedIds = useMemo(() => {
    return Object.keys(rowSelection);
  }, [rowSelection]);

  // Load saved preference
  useEffect(() => {
    const v = localStorage.getItem("pl_column_visibility");
    const o = localStorage.getItem("pl_column_order");

    if (v) setColumnVisibility(JSON.parse(v));
    if (o) {
      const parsed = JSON.parse(o);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setColumnOrder(parsed);
        return;
      }
    }

    // fallback default
    setColumnOrder(COLUMN_CONFIG.map((c) => c.id));
  }, []);

  // Persist
  useEffect(() => {
    localStorage.setItem(
      "pl_column_visibility",
      JSON.stringify(columnVisibility),
    );
  }, [columnVisibility]);

  useEffect(() => {
    localStorage.setItem("pl_column_order", JSON.stringify(columnOrder));
  }, [columnOrder]);

  const debouncedSetSearch = useMemo(
    () =>
      debounce((value: string) => {
        setSearch(value);
        setPage(1);
      }, 500),
    [],
  );

  const fetchLeads = async () => {
    try {
      setLoading(true);

      const matchedGroup = GROUPED_TYPES.find((g) => g.id === selectedType);

      const typeParam =
        selectedType === "all"
          ? undefined
          : matchedGroup
            ? matchedGroup.types.map((t) => t.id).join(",")
            : selectedType;

      const response = await getPlatformLeads({
        page,
        limit,
        search,
        type: typeParam,
      });

      const leadsData = response.data || [];
      const metaData = response.meta || {};

      setData(leadsData);

      setMeta({
        total: metaData.total || 0,
        page: metaData.page || page,
        limit: metaData.limit || limit,
        totalPages: metaData.totalPages || 1,
        hasNextPage: metaData.hasNextPage || false,
        hasPrevPage: metaData.hasPrevPage || false,
      });

      if (selectedType === "all") {
        setAllTotal(metaData.total || 0);
      }
    } catch (error) {
      console.error("Error fetching platform leads:", error);

      setData([]);
      setMeta({
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [page, limit, search, selectedType]);

  useEffect(() => {
    setPage(1);
    setSearch("");
  }, [selectedType]);

  const showTypeColumn = useMemo(() => {
    return [
      "all",
      "ai-for-pm",
      "pm-fellowship",
      "interview-course",
      "gen-ai",
      "ai-for-product-leaders",
    ].includes(selectedType);
  }, [selectedType]);

  const handleStatusChange = async (
    contactId: number | string,
    newStatus: string,
  ) => {
    try {
      await updatePlatformLeadsByStatus(String(contactId), newStatus);
      setData((prev) =>
        prev.map((c) =>
          String(c.id) === String(contactId) ? { ...c, status: newStatus } : c,
        ),
      );
    } catch (error) {
      console.error("Error updating status:", error);
      fetchLeads();
    }
  };

  const handleAssigneeChange = async (
    contactId: number | string,
    newAssignee: string,
  ) => {
    try {
      await updatePlatformLeadsByAssignee(String(contactId), newAssignee);
      setData((prev) =>
        prev.map((c) =>
          String(c.id) === String(contactId)
            ? { ...c, assignedTo: newAssignee }
            : c,
        ),
      );
    } catch (error) {
      console.error("Error updating assignee:", error);
      fetchLeads();
    }
  };

  const handleViewLead = async (lead: ILead) => {
    setSelectedViewLead(lead);
    setViewDialogOpen(true);
  };

  const handleDeleteLead = async (lead: ILead) => {
    setSelectedDeleteLead(lead);
    setDeleteDialogOpen(true);
  };

  const handleDeleteSingle = async (id: string) => {
    try {
      setDeleting(true);
      await deletePlatformLeadsById(id);
      fetchLeads();
    } catch (error) {
      console.error("Delete Error:", error);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;

    try {
      setDeleting(true);
      await deletePlatformLeadsArray(selectedIds);
      setRowSelection({});
      fetchLeads();
    } catch (error) {
      console.error("Bulk Delete Error:", error);
    } finally {
      setDeleting(false);
    }
  };

  const handleCopySelected = async () => {
    if (selectedIds.length === 0) return;

    try {
      const selectedLeads = data.filter((lead) =>
        selectedIds.includes(String(lead.id)),
      );

      // Get visible columns in order
      const visibleColumns = columnOrder.filter(
        (colId) => columnVisibility[colId] !== false,
      );

      // Build header row
      const headers = visibleColumns
        .map((colId) => {
          const col = COLUMN_CONFIG.find((c) => c.id === colId);
          return col ? col.label : "";
        })
        .filter(Boolean);

      // Build data rows
      const rows = selectedLeads.map((lead) => {
        return visibleColumns.map((colId) => {
          switch (colId) {
            case "name":
              return lead.name || "";
            case "email":
              return lead.email || "";
            case "phone":
              return lead.phone || "";
            case "type":
              return showTypeColumn ? lead.type || "" : "";
            case "createdAt":
              return lead.createdAt ? formatDataTime(lead.createdAt) : "";
            case "assignee":
              return lead.assignedTo || "N/A";
            case "status":
              return lead.status || "";
            default:
              return "";
          }
        });
      });

      // Create TSV format (Tab-separated values work best for pasting into spreadsheets)
      const tsvContent = [
        headers.join("\t"),
        ...rows.map((row) => row.join("\t")),
      ].join("\n");

      await navigator.clipboard.writeText(tsvContent);

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Copy Error:", error);
    }
  };

  // Keyboard shortcut for copy (Ctrl/Cmd + C)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selectedIds.length > 0) {
        // Check if user is not typing in an input field
        const activeElement = document.activeElement;
        const isInputField =
          activeElement?.tagName === "INPUT" ||
          activeElement?.tagName === "TEXTAREA";

        if (!isInputField) {
          e.preventDefault();
          handleCopySelected();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds, data, columnOrder, columnVisibility, showTypeColumn]);

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  return (
    <>
      <div className="flex flex-col h-screen">
        <div className="px-5 h-16 flex justify-between items-center border-b">
          <div className="flex items-center gap-2">
            <SidebarTrigger size={"lg"} />
            <p className="text-lg font-semibold">Platform Leads</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => router.push("platform-leads/assignee")}
              className="bg-[#335DC8] hover:bg-[#335DC8] text-white flex items-center gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              Sales Info
            </Button>

            <Button
              onClick={() => setDownloadDialogOpen(true)}
              className="bg-[#335DC8] hover:bg-[#335DC8] text-white flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download
            </Button>
          </div>
        </div>

        <div className="flex flex-col h-full flex-1 overflow-auto p-5 bg-gray-50">
          <div className="w-full">
            {/* FILTER SECTION */}
            <div className="flex flex-wrap gap-2 mb-6">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={selectedType === "all" ? "default" : "outline"}
                  size="lg"
                  onClick={() => setSelectedType("all")}
                >
                  All Types
                  <Badge variant="secondary" className="ml-2">
                    {allTotal}
                  </Badge>
                </Button>

                {GROUPED_TYPES.map((group) => {
                  const isSelected =
                    selectedType === group.id ||
                    group.types.some((t) => t.id === selectedType);

                  if (group.types.length === 1) {
                    return (
                      <Button
                        key={group.id}
                        variant={isSelected ? "default" : "outline"}
                        size="lg"
                        onClick={() => setSelectedType(group.types[0].id)}
                      >
                        {group.label}
                      </Button>
                    );
                  }

                  return (
                    <DropdownMenu key={group.id}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant={isSelected ? "default" : "outline"}
                          size="lg"
                        >
                          {group.label}
                        </Button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent>
                        <DropdownMenuItem
                          onClick={() => setSelectedType(group.id)}
                        >
                          All Leads
                        </DropdownMenuItem>

                        {group.types.map((type) => (
                          <DropdownMenuItem
                            key={type.id}
                            onClick={() => setSelectedType(type.id)}
                          >
                            {type.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                })}
              </div>
            </div>

            {/* SEARCH + ACTIONS */}
            <div className="flex items-center pb-2 justify-between">
              {/* LEFT: Search */}
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search by name, email or phone..."
                  onChange={(e) => debouncedSetSearch(e.target.value)}
                  className="w-[280px]"
                />
              </div>

              {/* RIGHT: Bulk actions + Copy + Columns */}
              <div className="flex items-center gap-2">
                {deleting && <div className="text-sm">Deleting...</div>}

                {selectedIds.length > 0 && (
                  <>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete ({selectedIds.length})
                        </Button>
                      </AlertDialogTrigger>

                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
                          <AlertDialogDescription>
                            You are deleting {selectedIds.length} contact(s).
                            This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDeleteSelected}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopySelected}
                      className="flex items-center gap-1"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy ({selectedIds.length})
                        </>
                      )}
                    </Button>
                  </>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Settings /> Columns
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent className="w-64">
                    <DndContext
                      collisionDetection={closestCenter}
                      onDragEnd={(e) => {
                        const { active, over } = e;
                        if (!over || active.id === over.id) return;

                        setColumnOrder((prev) => {
                          const oldIndex = prev.indexOf(active.id as string);
                          const newIndex = prev.indexOf(over.id as string);

                          const next = [...prev];
                          const [moved] = next.splice(oldIndex, 1);
                          next.splice(newIndex, 0, moved);
                          return next;
                        });
                      }}
                    >
                      <SortableContext
                        items={columnOrder}
                        strategy={verticalListSortingStrategy}
                      >
                        {columnOrder.map((id) => {
                          const col = COLUMN_CONFIG.find((c) => c.id === id);
                          if (!col) return null;

                          return (
                            <SortableColumnItem
                              key={id}
                              id={id}
                              label={col.label}
                              visible={columnVisibility[id] ?? true}
                              onToggle={() =>
                                setColumnVisibility((prev) => ({
                                  ...prev,
                                  [id]: !(prev[id] ?? true),
                                }))
                              }
                            />
                          );
                        })}
                      </SortableContext>
                    </DndContext>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* TABLE */}
            <div className="overflow-hidden rounded-md border bg-white">
              <PlatformLeadsTable
                data={data}
                rowSelection={rowSelection}
                onRowSelectionChange={setRowSelection}
                columnVisibility={columnVisibility}
                onColumnVisibilityChange={setColumnVisibility}
                columnOrder={columnOrder}
                onColumnOrderChange={setColumnOrder}
                showTypeColumn={showTypeColumn}
                onAssigneeChange={handleAssigneeChange}
                onStatusChange={handleStatusChange}
                onView={handleViewLead}
                onDelete={
                  currentRole === "superadmin" ? handleDeleteLead : undefined
                }
                loading={loading}
                skeletonRows={limit}
              />
              {!loading && data.length === 0 && (
                <div className="p-6 text-center text-sm text-gray-500">
                  No results found
                </div>
              )}
            </div>

            {/* PAGINATION FOOTER */}
            <div className="p-4">
              <Pagination
                meta={meta}
                onPageChange={handlePageChange}
                onLimitChange={handleLimitChange}
              />
            </div>
          </div>
        </div>
      </div>

      <DownloadDialog
        open={downloadDialogOpen}
        onClose={() => setDownloadDialogOpen(false)}
      />

      <LeadDetailsDialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        lead={selectedViewLead}
      />

      <LeadDeleteDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        lead={selectedDeleteLead}
        onDelete={handleDeleteSingle}
      />
    </>
  );
};

export default PlatformLeads;
