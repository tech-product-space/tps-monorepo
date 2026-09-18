"use client";

import { useEffect, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  CohortMember,
  getAllCohortMembers,
  deleteCohortMember,
} from "@/services/cohort-members/cohort-members";
import { CohortMembersTable } from "./CohortMemeberTable/CohortMemeberTable";
import LoadingSpinner from "@/components/Common/Loading/HoverLoading";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddEditCohortMemberDialog } from "./AddEditCohortMemberDialog/AddEditCohortMemberDialog";
import { useNotification } from "@/helpers/NotificationContext";
import { UploadCsvButton } from "./UploadCSV/UploadCsvButton";
import Pagination, { IPaginationMeta } from "@/components/ui/custom/Pagination";

export const CohortMembers = () => {
  const { showNotification } = useNotification();

  const [members, setMembers] = useState<CohortMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState("all");
  const [cohort, setCohort] = useState("all");

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [meta, setMeta] = useState<IPaginationMeta | null>(null);

  // Dialog states
  const [openForm, setOpenForm] = useState(false);
  const [selected, setSelected] = useState<CohortMember | null>(null);

  const hasActiveFilters =
    search.trim() !== "" || course !== "all" || cohort !== "all";

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const res = await getAllCohortMembers({
        search,
        course,
        cohort,
        page,
        limit,
      });

      setMembers(res.data);
      setMeta(res.meta);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    const delay = setTimeout(fetchMembers, 400);
    return () => clearTimeout(delay);
  }, [search, course, cohort, limit]);

  useEffect(() => {
    fetchMembers();
  }, [page]);

  const handleDelete = async (member: CohortMember) => {
    try {
      await deleteCohortMember(member.id);

      showNotification(
        "success",
        "Member Deleted",
        `${member?.user?.name} has been removed successfully.`,
      );

      fetchMembers();
    } catch (error: any) {
      showNotification(
        "error",
        "Delete Failed",
        error?.response?.data?.message || "Unable to delete the member.",
      );
    }
  };

  const clearFilters = () => {
    setSearch("");
    setCourse("all");
    setCohort("all");
    setPage(1);
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="px-5 h-16 flex justify-between items-center border-b">
        <div className="flex items-center gap-2">
          <SidebarTrigger size="lg" />
          <p className="text-lg font-semibold">Cohort Members</p>
        </div>

        <div className="flex gap-2">
          <UploadCsvButton onSuccess={fetchMembers} />

          <Button onClick={() => setOpenForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Member
          </Button>
        </div>
      </div>

      {/* ================= Filters ================= */}
      <div className="bg-white px-5 py-3 flex gap-3 border-b items-center flex-wrap">
        <Input
          placeholder="Search name, email or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />

        <Select value={course} onValueChange={setCourse}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Course" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Courses</SelectItem>
            <SelectItem value="Advanced AI Program">
              Advanced AI Program
            </SelectItem>
            <SelectItem value="Product Management Fellowship">
              Product Management Fellowship
            </SelectItem>
          </SelectContent>
        </Select>

        <Select value={cohort} onValueChange={setCohort}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Cohort" />
          </SelectTrigger>

          <SelectContent className="max-h-60 overflow-y-auto">
            <SelectItem value="all">All Cohorts</SelectItem>

            {Array.from({ length: 100 }, (_, i) => {
              const value = (i + 1).toString();
              return (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            onClick={clearFilters}
            className="text-muted-foreground"
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* ================= Table ================= */}
      <div className="flex-1 overflow-y-auto scrollbar-modern bg-gray-50 relative">
        <div className="p-5 pb-24">
          <CohortMembersTable
            members={members}
            onEdit={(m) => {
              setSelected(m);
              setOpenForm(true);
            }}
            onDelete={handleDelete}
          />
        </div>

        {loading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center z-10">
            <LoadingSpinner />
          </div>
        )}

        {meta && meta.total > 0 && (
          <div className="sticky bottom-0 pb-3 bg-white border-t shadow-sm z-20">
            <Pagination
              meta={meta}
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          </div>
        )}
      </div>

      <AddEditCohortMemberDialog
        open={openForm}
        member={selected}
        onClose={() => {
          setOpenForm(false);
          setSelected(null);
        }}
        onSuccess={fetchMembers}
      />
    </div>
  );
};
