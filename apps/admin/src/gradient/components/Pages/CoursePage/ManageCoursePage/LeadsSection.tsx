"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import { Badge } from "@/gradient/components/ui/badge";
import { Input } from "@/gradient/components/ui/input";
import { Button } from "@/gradient/components/ui/button";
import Pagination, { IPaginationMeta } from "@/gradient/components/ui/custom/Pagination";
import { DownloadExcelButton } from "@/gradient/components/ui/custom/DownloadCsvButton";
import { courseService } from "@/gradient/services/courseService";
import { Course } from "@/gradient/types/course";
import { Lead } from "@/gradient/types/lead";
import { COURSE_LEAD_TYPE_FILTERS } from "../constants";

const EMPTY_META: IPaginationMeta = {
  total: 0,
  page: 1,
  limit: 10,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

export default function LeadsSection({ course }: { course: Course }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [meta, setMeta] = useState<IPaginationMeta>(EMPTY_META);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [subSource, setSubSource] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const response = await courseService.getCourseLeads(course.id, {
        page,
        limit,
        subSource: subSource || undefined,
        search: search || undefined,
      });
      setLeads(response.data || []);
      setMeta(response.meta || EMPTY_META);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to load leads.");
    } finally {
      setLoading(false);
    }
  }, [course.id, page, limit, subSource, search]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Any filter change restarts at page 1 — staying on page 4 of a narrower
  // result set would show an empty table.
  const applyFilter = (value: string) => {
    setSubSource(value);
    setPage(1);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <CardTitle>Leads ({meta.total})</CardTitle>

        <DownloadExcelButton
          filename={`${course.slug}-leads`}
          fetchPage={(exportPage, exportLimit) =>
            courseService
              .getCourseLeads(course.id, {
                page: exportPage,
                limit: exportLimit,
                subSource: subSource || undefined,
                search: search || undefined,
              })
              .then((response) => ({
                data: response.data,
                meta: response.meta,
              }))
          }
        />
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex flex-wrap gap-2">
            {COURSE_LEAD_TYPE_FILTERS.map((filter) => (
              <Button
                key={filter.value || "all"}
                size="sm"
                variant={subSource === filter.value ? "default" : "outline"}
                onClick={() => applyFilter(filter.value)}
              >
                {filter.label}
              </Button>
            ))}
          </div>

          <form
            className="flex flex-1 gap-2 md:justify-end"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
              setPage(1);
            }}
          >
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, email or phone"
              className="md:max-w-xs"
            />
            <Button type="submit" variant="outline" size="icon">
              <Search className="h-4 w-4" />
            </Button>
          </form>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading leads...
                    </div>
                  </TableCell>
                </TableRow>
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No leads yet.
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.name}</TableCell>

                    <TableCell>
                      <p className="text-sm">{lead.email || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {lead.phone
                          ? `${lead.countryCode || ""} ${lead.phone}`
                          : "—"}
                      </p>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline">
                        {lead.subSourceDisplayName || lead.subSource || "—"}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={
                          lead.status === "duplicate" ? "secondary" : "default"
                        }
                      >
                        {lead.status}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(lead.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination
          meta={meta}
          onPageChange={setPage}
          onLimitChange={(newLimit) => {
            setLimit(newLimit);
            setPage(1);
          }}
        />
      </CardContent>
    </Card>
  );
}
