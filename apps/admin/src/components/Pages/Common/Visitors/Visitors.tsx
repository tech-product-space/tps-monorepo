"use client";

import Pagination from '@/components/ui/custom/Pagination';
import { Input } from '@/components/ui/input';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAllVisitors } from '@/services/visitor/visitor';
import { IPaginationMeta } from '@/types/pagination';
import { formatDataTime } from '@/utils/formatDataTime';
import { Loader2, Search, X } from 'lucide-react';
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from 'react';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { debounce } from '@/utils/debounce';

interface VisitorType {
    id: string;
    lastVisitedUrl: string | null;
    firstSeen: string;
    lastSeen: string;
    isBlocked: boolean;
    createdAt: string;
    updatedAt: string;
}

const Visitors = () => {
    const router = useRouter();
    const [visitors, setVisitors] = useState<VisitorType[]>([]);

    const [searchTerm, setSearchTerm] = useState("");
    const [filterBlocked, setFilterBlocked] = useState<string | null>(null);

    const [meta, setMeta] = useState<IPaginationMeta>({
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
    });

    const [loading, setLoading] = useState(false);

    // Fetch visitors FROM BACKEND
    const fetchVisitors = async (page = 1, limit = 20, search = "", blocked: string | null = null) => {
        try {
            setLoading(true);

            const response = await getAllVisitors({
                page,
                limit,
                search,
                blocked,
            });

            setVisitors(response.data.data);
            setMeta(response.data.meta);
        } catch (error) {
            console.error("Failed to fetch visitors:", error);
        } finally {
            setLoading(false);
        }
    };

    // Initial load
    useEffect(() => {
        fetchVisitors(meta.page, meta.limit, searchTerm, filterBlocked);
    }, []);

    const debouncedSearchFilter = useMemo(
        () =>
            debounce((search: string, blocked: string | null) => {
                fetchVisitors(1, meta.limit, search, blocked);
            }, 400),
        [meta.limit]
    );

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchTerm(value);
        debouncedSearchFilter(value, filterBlocked);
    };

    const handleClearSearch = () => {
        setSearchTerm("");
        debouncedSearchFilter("", filterBlocked);
    };

    const handleViewVisitor = (visitor: VisitorType) => {
        router.push(`visitor/${visitor.id}`);
    };

    const handleFilterChange = (val: string) => {
        const newFilter = val === "all" ? null : val;
        setFilterBlocked(newFilter);
        debouncedSearchFilter(searchTerm, newFilter);
    };

    const handlePageChange = (newPage: number) => {
        fetchVisitors(newPage, meta.limit, searchTerm, filterBlocked);
    };

    const handleLimitChange = (newLimit: number) => {
        fetchVisitors(1, newLimit, searchTerm, filterBlocked);
    };

    return (
        <div className="flex flex-col h-screen">
            {/* Header */}
            <div className="px-5 h-16 flex justify-between items-center border-b bg-white">
                <div className="flex items-center gap-2">
                    <SidebarTrigger size={"lg"} />
                    <p className="text-lg font-semibold">All Visitors</p>
                </div>
            </div>

            {/* Toolbar */}
            <div className="px-6 py-4 bg-white border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">

                {/* Search Input */}
                <div className="relative w-full max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        type="text"
                        placeholder="Search by visitorId..."
                        value={searchTerm}
                        onChange={handleSearchChange}
                        className="pl-9 pr-9 w-full bg-gray-50 border-gray-200 focus:bg-white transition-colors"
                    />
                    {searchTerm && (
                        <button
                            onClick={handleClearSearch}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Block Filter */}
                <Select
                    onValueChange={handleFilterChange}
                    defaultValue="all"
                >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter blocked" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Visitors</SelectItem>
                        <SelectItem value="true">Blocked Only</SelectItem>
                        <SelectItem value="false">Unblocked Only</SelectItem>
                    </SelectContent>
                </Select>

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
                                    <TableHead>Visitor ID</TableHead>
                                    <TableHead>First Seen</TableHead>
                                    <TableHead>Last Seen</TableHead>
                                    <TableHead>Blocked</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {visitors.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center text-gray-500 py-6">
                                            No visitors found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    visitors.map((v) => (
                                        <TableRow
                                            key={v.id}
                                            onClick={() => handleViewVisitor(v)}
                                            className={`cursor-pointer transition-colors hover:bg-gray-100`}
                                        >
                                            <TableCell>{v.id}</TableCell>
                                            <TableCell>{formatDataTime(v.firstSeen)}</TableCell>
                                            <TableCell>{formatDataTime(v.lastSeen)}</TableCell>
                                            <TableCell>
                                                {v.isBlocked ? (
                                                    <span className="text-red-600 font-medium">Yes</span>
                                                ) : (
                                                    <span className="text-green-600 font-medium">No</span>
                                                )}
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

export default Visitors;
