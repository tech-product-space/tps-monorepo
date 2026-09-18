"use client";

import { useEffect, useState } from "react";
import { subscriberService } from "@/gradient/services/subscriberService";
import type { Subscriber } from "@/gradient/types/subscriber";

import { Input } from "@/gradient/components/ui/input";
import { Button } from "@/gradient/components/ui/button";
import { DownloadExcelButton } from "@/gradient/components/ui/custom/DownloadCsvButton";
import { Card, CardContent, CardHeader } from "@/gradient/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/gradient/components/ui/select";
import Pagination from "@/gradient/components/ui/custom/Pagination";
import { IPaginationMeta } from "@/gradient/types/pagination";
import SubscribersTable from "./components/SubscribersTable";

const STATUS_FILTERS = [
    { label: "All", value: null },
    { label: "Active", value: "active" },
    { label: "Unsubscribed", value: "unsubscribed" },
];

// This table is the campaign suppression list as well as the newsletter list,
// so `source` is what separates "signed up" from "opted out of a campaign" —
// which is how you answer "how much churn did that send cause".
// Mirrors SUBSCRIBER_SOURCE in the backend.
const ALL_SOURCES = "all";

const SOURCE_FILTERS = [
    { label: "All sources", value: ALL_SOURCES },
    { label: "Newsletter form", value: "footer" },
    { label: "Campaign opt-out", value: "campaignUnsubscribe" },
    { label: "CSV import", value: "import" },
];

const SubscribersPage = () => {
    const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
    const [status, setStatus] = useState<string | null>(null);
    const [source, setSource] = useState<string>(ALL_SOURCES);
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

    // The backend treats an absent `source` as "any", so the sentinel never
    // reaches it — sending "all" would filter for a literal source of "all".
    const sourceParam = source === ALL_SOURCES ? null : source;

    const fetchSubscribers = async () => {
        const res = await subscriberService.getSubscribers({
            status,
            source: sourceParam,
            search,
            page,
            limit,
        });

        setSubscribers(res.data || []);
        if (res.meta) {
            setMeta(res.meta);
        }
    };

    useEffect(() => {
        fetchSubscribers();
    }, [status, source, search, page, limit]);

    return (
        <Card>
            <CardHeader className="space-y-6">
                {/* STATUS FILTER */}
                <div className="flex flex-wrap gap-2">
                    {STATUS_FILTERS.map((filter) => (
                        <Button
                            key={filter.label}
                            variant={status === filter.value ? "default" : "outline"}
                            onClick={() => {
                                setStatus(filter.value);
                                setPage(1);
                            }}
                        >
                            {filter.label}
                        </Button>
                    ))}
                </div>

                {/* SEARCH, SOURCE AND DOWNLOAD */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="w-full max-w-sm min-w-60">
                            <Input
                                placeholder="Search email or name..."
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setPage(1);
                                }}
                            />
                        </div>

                        <Select
                            value={source}
                            onValueChange={(value) => {
                                setSource(value);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="w-50">
                                <SelectValue placeholder="All sources" />
                            </SelectTrigger>
                            <SelectContent>
                                {SOURCE_FILTERS.map((filter) => (
                                    <SelectItem key={filter.value} value={filter.value}>
                                        {filter.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {subscribers.length > 0 && (
                        <DownloadExcelButton
                            fetchPage={(page, limit) =>
                                subscriberService.getSubscribers({
                                    status,
                                    source: sourceParam,
                                    search,
                                    page,
                                    limit,
                                })
                            }
                            filename="subscribers"
                        />
                    )}
                </div>
            </CardHeader>

            {/* TABLE */}
            <CardContent className="space-y-4">
                <div className="rounded-md border">
                    <SubscribersTable subscribers={subscribers} />
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

export default SubscribersPage;
