"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  getUnPublishedInterviewQuestions,
  setPublishStatus,
} from "@/services/interview-questions/interview-question-service";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Pencil, Eye } from "lucide-react";
import Pagination from "@/components/ui/custom/Pagination";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { debounce } from "@/utils/debounce";
import LoadingSpinner from "@/components/Common/Loading/HoverLoading";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateOnly } from "@/utils/formatDataTime";
import { useNotification } from "@/helpers/NotificationContext";

interface IInterviewQuestion {
  _id: string;
  title: string;
  company: string;
  role: string;
  type: string;
  isPublished: boolean;
  slug?: string;
  metaTitle?: string;
  metaDesc?: string;
  createdAt: string;
  answers: any[];
}

export default function InterviewQuestions() {
  const [questions, setQuestions] = useState<IInterviewQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const { showNotification } = useNotification();

  const [meta, setMeta] = useState({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const [searchTerm, setSearchTerm] = useState("");

  const router = useRouter();
  const role = Cookies.get("currentRole");

  // 🔥 Fetch API
  const fetchQuestions = async (page = 1, limit = 20, search = "") => {
    try {
      setLoading(true);
      const res = await getUnPublishedInterviewQuestions({
        page,
        limit,
        search,
      });

      setQuestions(res.data);
      setMeta(res.meta);
    } catch (error) {
      console.error("Failed:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions(meta.page, meta.limit);
  }, []);

  // 🔥 Debounced Search
  const debouncedSearch = useMemo(
    () =>
      debounce((value: string) => {
        fetchQuestions(1, meta.limit, value);
      }, 400),
    [meta.limit]
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    debouncedSearch(value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    debouncedSearch("");
  };

  // 🟩 Publish / Unpublish
  const togglePublish = async (id: string, status: boolean, e: any) => {
    e.stopPropagation();
    await setPublishStatus(id, !status);

    setQuestions((prev) =>
      prev.map((q) => (q._id === id ? { ...q, isPublished: !status } : q))
    );
  };

  const handleQuestionClick = (q: IInterviewQuestion) => {
    router.push(`/${role}/interview-questions/${q._id}`);
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="px-5 h-16 flex justify-between items-center border-b border-gray-200">
        {/* LEFT: Title */}
        <div className="flex items-center gap-2 text-lg font-semibold">
          <ArrowLeft
            className="h-5 w-5 cursor-pointer"
            onClick={() => router.back()}
          />

          <span>Unpublished Interview Questions</span>
        </div>

        {/* RIGHT: Search + Clear Button side-by-side */}
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />

            <Input
              type="text"
              placeholder="Search by title..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="pl-9 pr-9"
            />

            {searchTerm && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="p-5 overflow-y-auto bg-gray-50 h-[90vh]">
        {loading ? (
          <LoadingSpinner />
        ) : (
          <div className="bg-white rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Answers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {questions.map((q) => (
                  <TableRow
                    key={q._id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleQuestionClick(q)}
                  >
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              {q.title.split(" ").slice(0, 3).join(" ") + "..."}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>{q.title}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell>{q.company}</TableCell>
                    <TableCell>{q.role}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{q.type}</Badge>
                    </TableCell>
                    <TableCell>{q.answers.length}</TableCell>
                    <TableCell className="flex items-center gap-2">
                      {q.metaTitle && q.metaDesc && q.slug ? (
                        <>
                          <span
                            className={`px-2 py-1 rounded text-sm ${
                              q.isPublished
                                ? "bg-green-100 text-green-700"
                                : "bg-orange-100 text-orange-700"
                            }`}
                          >
                            {q.isPublished ? "Published" : "Draft"}
                          </span>

                          <Pencil
                            size={16}
                            className={`cursor-pointer ${
                              q.slug
                                ? "text-gray-700"
                                : "opacity-40 cursor-not-allowed"
                            }`}
                            onClick={(e) => {
                              if (!q.slug || !q.metaTitle || !q.metaDesc) {
                                showNotification(
                                  "error",
                                  "Cannot Publish",
                                  "Please add a Meta Details before publishing the question.",
                                  {
                                    label: "Close",
                                    onClick: () => {
                                      console.log("Close clicked");
                                    },
                                  }
                                );
                                return;
                              }

                              togglePublish(q._id, q.isPublished, e);
                            }}
                          />
                        </>
                      ) : (
                        <span>Add Meta Details</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {formatDateOnly(q.createdAt)}
                      {/* {new Date(q.createdAt).toLocaleDateString()} */}
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuestionClick(q);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="p-4">
        <Pagination
          meta={meta}
          onPageChange={(page) => fetchQuestions(page, meta.limit, searchTerm)}
          onLimitChange={(limit) => fetchQuestions(1, limit, searchTerm)}
        />
      </div>
    </div>
  );
}
