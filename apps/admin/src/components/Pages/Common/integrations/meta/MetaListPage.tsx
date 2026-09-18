"use client";

import React, { useEffect, useState } from "react";
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

import { Trash2, Loader2 } from "lucide-react";
import { MetaLogo } from "../components/meta-logo";
import { IMetaIntegrationListItem } from "@/types/integrations/meta";
import { metaService } from "@/services/integrations/metaService";
import { useRouter } from "next/navigation";

const MetaListPage = () => {

    const [integrations, setIntegrations] = useState<IMetaIntegrationListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [connecting, setConnecting] = useState(false);

    const router = useRouter()

    const fetchIntegrations = async () => {
        try {
            const data = await metaService.list();
            setIntegrations(data);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchIntegrations();
    }, []);

    const connectMeta = async () => {

        try {

            setConnecting(true);

            const returnUrl = window.location.pathname;

            const res = await metaService.connect(returnUrl);

            window.location.href = res.url;

        } catch (error) {

            console.error("Failed to initiate connection", error);
            setConnecting(false);

        }

    };

    const deleteIntegration = async (id: string) => {

        setDeletingId(id);

        try {

            await metaService.delete(id);

            setIntegrations(prev =>
                prev.filter(i => i.id !== id)
            );

        } finally {

            setDeletingId(null);

        }

    };

    return (

        <div className="p-8 space-y-8 h-full overflow-y-auto">

            {/* Meta Header Card */}

            <Card className="overflow-hidden border shadow-sm pt-0">

                <div className="bg-linear-to-r from-[#0064E0] via-[#1C7CFF] to-[#00A3FF] p-8 text-white">

                    <div className="flex items-center justify-between">

                        <div className="flex items-center gap-4">

                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur">

                                <MetaLogo className="h-7 w-7 text-white" />

                            </div>

                            <div>

                                <h2 className="text-xl font-semibold">
                                    Meta Lead Ads
                                </h2>

                                <p className="text-sm text-white/80">
                                    Connect Meta to sync lead forms and capture leads automatically.
                                </p>

                            </div>

                        </div>

                        <Button
                            onClick={connectMeta}
                            disabled={connecting}
                            className="bg-white text-[#0064E0] hover:bg-white/90 font-medium"
                        >

                            {connecting ? (

                                <Loader2 className="h-4 w-4 animate-spin" />

                            ) : (

                                "Connect Meta"

                            )}

                        </Button>

                    </div>

                </div>

                <CardContent className="p-6">

                    {loading ? (

                        <div className="flex justify-center py-10">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>

                    ) : (

                        <Table>

                            <TableHeader>

                                <TableRow>

                                    <TableHead>Account</TableHead>

                                    <TableHead>
                                        Date Connected
                                    </TableHead>

                                    <TableHead className="text-right">
                                        Actions
                                    </TableHead>

                                </TableRow>

                            </TableHeader>

                            <TableBody>

                                {integrations.length === 0 && (

                                    <TableRow>

                                        <TableCell
                                            colSpan={3}
                                            className="text-center py-6"
                                        >
                                            No Meta integrations connected
                                        </TableCell>

                                    </TableRow>

                                )}

                                {integrations.map((integration) => (

                                    <TableRow key={integration.id}>

                                        <TableCell className="flex items-center gap-3 font-medium">

                                            <MetaLogo className="h-5 w-5 text-[#0064E0]" />

                                            {integration.account_name}

                                        </TableCell>

                                        <TableCell>

                                            {new Date(
                                                integration.createdAt
                                            ).toLocaleDateString()}

                                        </TableCell>

                                        <TableCell className="flex justify-end gap-2">

                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    router.push(`meta/${integration.id}/pages`)
                                                }
                                            >
                                                Pages
                                            </Button>

                                            {/* DELETE CONFIRMATION */}

                                            <AlertDialog>

                                                <AlertDialogTrigger asChild>

                                                    <Button
                                                        variant="destructive"
                                                        size="icon"
                                                        disabled={deletingId === integration.id}
                                                    >

                                                        {deletingId === integration.id ? (

                                                            <Loader2 className="h-4 w-4 animate-spin" />

                                                        ) : (

                                                            <Trash2 className="h-4 w-4" />

                                                        )}

                                                    </Button>

                                                </AlertDialogTrigger>

                                                <AlertDialogContent>

                                                    <AlertDialogHeader>

                                                        <AlertDialogTitle>
                                                            Delete Meta Integration
                                                        </AlertDialogTitle>

                                                        <AlertDialogDescription className="space-y-3">

                                                            <p>
                                                                Are you sure you want to delete this Meta integration?
                                                            </p>

                                                            <p className="font-medium text-red-500">
                                                                This will permanently delete:
                                                            </p>

                                                            <ul className="list-disc ml-5 text-sm text-muted-foreground">

                                                                <li>
                                                                    All connected Meta pages
                                                                </li>

                                                                <li>
                                                                    All synced lead forms
                                                                </li>

                                                                <li>
                                                                    All lead type mappings
                                                                </li>

                                                            </ul>

                                                            <p className="pt-2">
                                                                This action cannot be undone.
                                                            </p>

                                                        </AlertDialogDescription>

                                                    </AlertDialogHeader>

                                                    <AlertDialogFooter>

                                                        <AlertDialogCancel>
                                                            Cancel
                                                        </AlertDialogCancel>

                                                        <AlertDialogAction
                                                            onClick={() =>
                                                                deleteIntegration(integration.id)
                                                            }
                                                            className="bg-red-600 hover:bg-red-700"
                                                        >

                                                            Delete Integration

                                                        </AlertDialogAction>

                                                    </AlertDialogFooter>

                                                </AlertDialogContent>

                                            </AlertDialog>

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

};

export default MetaListPage;