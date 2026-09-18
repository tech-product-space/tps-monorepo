"use client";

import { useEffect, useState } from "react";
import { leadService } from "@/gradient/services/leadService";
import type { Lead } from "@/gradient/types/lead";
import type { LeadSource } from "@/gradient/services/leadService";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { DownloadExcelButton } from "@/gradient/components/ui/custom/DownloadCsvButton";
import LeadsTable from "./components/LeadsTable";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "@/gradient/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader } from "@/gradient/components/ui/card";
import Pagination from "@/gradient/components/ui/custom/Pagination";
import { IPaginationMeta } from "@/gradient/types/pagination";


const LeadsPage = () => {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [sources, setSources] = useState<LeadSource[]>([]);
    const [selectedSource, setSelectedSource] = useState<string | null>(null);
    const [selectedSubSource, setSelectedSubSource] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [meta, setMeta] = useState<IPaginationMeta>({
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
    });


    const fetchSources = async () => {
        const res = await leadService.getSources();
        setSources(res.data || []);
    };

    const fetchLeads = async () => {
        const res = await leadService.getLeads({
            source: selectedSource,
            subSource: selectedSubSource,
            search,
            page,
            limit,
        });

        setLeads(res.data || []);
        if (res.meta) {
            setMeta(res.meta);
        }
    };


    useEffect(() => {
        fetchSources();
    }, []);

    useEffect(() => {
        fetchLeads();
    }, [selectedSource, selectedSubSource, search, page, limit]);


    return (
        <Card>

            <CardHeader className="space-y-6">
                {/* SOURCE FILTER */}
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant={!selectedSource ? "default" : "outline"}
                        onClick={() => {
                            setSelectedSource(null);
                            setSelectedSubSource(null);
                            setPage(1);
                        }}

                    >
                        All
                    </Button>

                    {sources.map((source) => {
                        const hasSubSources = source.subSources?.length;

                        if (!hasSubSources) {
                            return (
                                <Button
                                    key={source.source}
                                    variant={selectedSource === source.source ? "default" : "outline"}
                                    onClick={() => {
                                        setSelectedSource(source.source);
                                        setSelectedSubSource(null);
                                        setPage(1);
                                    }}

                                >
                                    {source.sourceDisplayName}
                                </Button>
                            );
                        }

                        return (
                            <DropdownMenu key={source.source}>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant={selectedSource === source.source ? "default" : "outline"}
                                        className="flex items-center gap-1"
                                    >
                                        {selectedSource === source.source && selectedSubSource
                                            ? `${source.sourceDisplayName} / ${source.subSources?.find(
                                                (s) => s.subSource === selectedSubSource
                                            )?.subSourceDisplayName
                                            }`
                                            : source.sourceDisplayName}
                                    </Button>
                                </DropdownMenuTrigger>

                                <DropdownMenuContent className="min-w-50 p-1">
                                    <DropdownMenuItem
                                        onClick={() => {
                                            setSelectedSource(source.source);
                                            setSelectedSubSource(null);
                                            setPage(1);
                                        }}

                                    >
                                        All
                                    </DropdownMenuItem>

                                    {source.subSources!.map((sub) => (
                                        <DropdownMenuItem
                                            className="whitespace-nowrap"
                                            key={sub.subSource}
                                            onClick={() => {
                                                setSelectedSource(source.source);
                                                setSelectedSubSource(sub.subSource);
                                                setPage(1);
                                            }}

                                        >
                                            {sub.subSourceDisplayName}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        );
                    })}
                </div>

                {/* SEARCH AND DOWNLOAD */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="w-full max-w-sm">
                        <Input
                            placeholder="Search name, email, phone..."
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(1);
                            }}

                        />
                    </div>
                    {leads.length > 0 && (
                        <DownloadExcelButton 
                            fetchPage={(page, limit) => leadService.getLeads({ source: selectedSource, subSource: selectedSubSource, search, page, limit })}
                            filename="leads"
                        />
                    )}
                </div>

            </CardHeader>

            {/* TABLE */}
            <CardContent className="space-y-4">
                <div className="rounded-md border">
                    <LeadsTable leads={leads} />
                </div>
                <Pagination
                    meta={meta}
                    onPageChange={setPage}
                    onLimitChange={setLimit}
                />
            </CardContent>

        </Card>
    );
};

export default LeadsPage;