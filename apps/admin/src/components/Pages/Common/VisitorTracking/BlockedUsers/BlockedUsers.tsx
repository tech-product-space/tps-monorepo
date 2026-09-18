"use client";

import React, { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Eye } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { blockedUsers } from "@/services/visitorTracking/visitorTracking";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Pagination, { IPaginationMeta } from "@/components/ui/custom/Pagination";

interface BlockedUserType {
  visitorId: string;
  lastVisitedUrl: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  email: string;
  phone: string;
}

export default function BlockedUsers() {
  const router = useRouter();

  const [users, setUsers] = useState<BlockedUserType[]>([]);
  const [meta, setMeta] = useState<IPaginationMeta>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();
  // Fetch blocked users
  const fetchBlockedUsers = async (page = 1, limit = 20) => {
    try {
      setLoading(true);
      const response = await blockedUsers(page, limit);

      setUsers(response.data.data);
      setMeta(response.data.meta);
    } catch (error) {
      console.error("Failed to load blocked users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlockedUsers(meta.page, meta.limit);
  }, []);

  // Pagination handlers
  const handlePageChange = (newPage: number) => {
    fetchBlockedUsers(newPage, meta.limit);
  };

  const handleLimitChange = (newLimit: number) => {
    fetchBlockedUsers(1, newLimit);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="px-6 h-16 flex items-center justify-between border-b bg-white shadow-sm">
        <div className="flex items-center gap-4">
          <ArrowLeft
            className="h-5 w-5 cursor-pointer hover:text-gray-700 transition-colors"
            onClick={() => router.back()}
          />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              Blocked Users
            </h1>
            <p className="text-xs text-gray-500">List of All Blocked Users</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="bg-white rounded-lg shadow">
          {loading ? (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Visitor ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Updated At</TableHead>
                  <TableHead>View</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-gray-500 py-6"
                    >
                      No blocked users found
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => (
                    <TableRow key={u.visitorId}>
                      <TableCell className="font-medium">
                        {u.visitorId}
                      </TableCell>
                      <TableCell>{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.phone}</TableCell>
                      <TableCell>
                        {new Date(u.updatedAt).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                        })}
                      </TableCell>
                      <TableCell>
                        <Eye
                          onClick={() => {
                            const basePath = pathname.replace(
                              "/blocked-users",
                              ""
                            );
                            router.push(`${basePath}/${u.visitorId}`);
                          }}
                          className=" h-4 w-4 text-gray-500 transition-transform duration-200 hover:text-gray-700 hover:-translate-z-1 cursor-pointer ml-2"
                        />
                      </TableCell>
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
    </div>
  );
}
