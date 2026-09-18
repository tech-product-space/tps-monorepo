"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";

import { Eye, Loader2, RefreshCw } from "lucide-react";

import { metaService } from "@/services/integrations/metaService";
import { IMetaPage } from "@/types/integrations/meta";

type FailedPage = {
    page_id: string;
    page_name: string;
    reason: string;
};

export default function MetaPagesPage() {

    const { integrationId } = useParams();

    const [pages, setPages] = useState<IMetaPage[]>([]);
    const [failedPages, setFailedPages] = useState<FailedPage[]>([]);

    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);

    const router = useRouter()

    const fetchPages = async () => {
        try {
            const data = await metaService.getPages(integrationId as string);
            setPages(data);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPages();
    }, []);

    const syncPages = async () => {

        try {

            setSyncing(true);

            const result = await metaService.syncPages(integrationId as string);

            setFailedPages(result.failedPages || []);

            await fetchPages();

        } finally {

            setSyncing(false);

        }

    };

    return (

        <div className="p-8 space-y-6 h-full overflow-y-auto">

            {/* Header */}

            <div className="flex items-center justify-between">

                <div>
                    <h1 className="text-xl font-semibold">
                        Meta Pages
                    </h1>

                    <p className="text-sm text-muted-foreground">
                        Sync pages from Meta and manage lead forms.
                    </p>
                </div>

                <Button
                    className="from-[#0064E0] via-[#1C7CFF] to-[#00A3FF] text-white"
                    onClick={syncPages}
                    disabled={syncing}
                >
                    {syncing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Sync Pages
                        </>
                    )}
                </Button>

            </div>

            {/* Failed Pages Section */}

            {failedPages.length > 0 && (

                <Card className="border-red-200 bg-red-50">

                    <CardContent className="p-6">

                        <h2 className="font-semibold text-red-600 mb-4">
                            Failed Pages
                        </h2>

                        <Table>

                            <TableHeader>
                                <TableRow>
                                    <TableHead>Page Name</TableHead>
                                    <TableHead>Page ID</TableHead>
                                    <TableHead>Reason</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>

                                {failedPages.map(page => (

                                    <TableRow key={page.page_id}>

                                        <TableCell className="font-medium">
                                            {page.page_name}
                                        </TableCell>

                                        <TableCell>
                                            {page.page_id}
                                        </TableCell>

                                        <TableCell className="text-red-600">
                                            {page.reason}
                                        </TableCell>

                                    </TableRow>

                                ))}

                            </TableBody>

                        </Table>

                    </CardContent>

                </Card>

            )}

            {/* Pages Table */}

            <Card>

                <CardContent className="p-6">

                    {loading ? (

                        <div className="flex justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>

                    ) : (

                        <Table>

                            <TableHeader>
                                <TableRow>
                                    <TableHead>Page Name</TableHead>
                                    <TableHead>Page ID</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>

                                {pages.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                            No pages synced
                                        </TableCell>
                                    </TableRow>
                                )}

                                {pages.map(page => (

                                    <TableRow key={page.id}>

                                        <TableCell className="font-medium">
                                            {page.page_name}
                                        </TableCell>

                                        <TableCell className="text-muted-foreground">
                                            {page.page_id}
                                        </TableCell>

                                        <TableCell>
                                            {new Date(page.createdAt).toLocaleDateString()}
                                        </TableCell>

                                        <TableCell className="flex justify-end gap-2">

                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    router.push(`pages/${page.id}`)
                                                }
                                            >
                                                <Eye className="h-4 w-4 mr-2" />
                                            </Button>

                                        </TableCell>
                                    </TableRow>

                                ))}

                            </TableBody>

                        </Table>

                    )}

                </CardContent>

            </Card>

        </div>

    );

}