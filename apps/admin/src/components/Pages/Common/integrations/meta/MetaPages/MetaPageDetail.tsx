"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

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

import { Loader2, RefreshCw } from "lucide-react";

import { metaService } from "@/services/integrations/metaService";
import { IMetaForm, IMetaPage } from "@/types/integrations/meta";
import LeadTypeSelector from "@/components/Common/ExternalLeads/LeadTypeSelector";
import { externalLeadService } from "@/services/Leads/externalLeadService";
import { ILeadType } from "@/types/externalLead";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface IMetaPageFormList extends IMetaForm {
    leadTypes: ILeadType[]
}

export default function MetaPageDetail() {

    const params = useParams();
    const pageId = params?.pageId as string;

    const [page, setPage] = useState<IMetaPage | null>(null);
    const [forms, setForms] = useState<IMetaPageFormList[]>([]);

    const [leadTypes, setLeadTypes] = useState<ILeadType[]>([])

    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);

    const [syncingLeads, setSyncingLeads] = useState<string | null>(null)

    const fetchPage = async () => {
        try {

            const res = await metaService.getPage(pageId);

            setPage(res.page);

        } catch (error) {
            console.error("Failed to fetch page", error);
        }
    };

    const fetchForms = async () => {
        try {

            const res = await metaService.getForms(pageId);

            setForms(res.forms);

        } catch (error) {
            console.error("Failed to fetch forms", error);
        }
    };

    const fetchLeadTypes = async () => {
        const res = await externalLeadService.getLeadTypes()
        setLeadTypes(res.types)
    }

    const syncLeads = async (formId: string) => {

        try {

            setSyncingLeads(formId)

            const res = await externalLeadService.syncMetaFormLeads(formId)
            toast.success(res?.message || "Sync started")

        } catch (error: any) {

            toast.error(error?.response?.data?.message || "Failed to sync leads")

        } finally {

            setSyncingLeads(null)

        }

    }

    const load = async () => {

        if (!pageId) return;

        try {

            setLoading(true);

            await Promise.all([
                fetchPage(),
                fetchForms(),
                fetchLeadTypes()
            ]);

        } finally {

            setLoading(false);

        }

    };

    useEffect(() => {

        if (!pageId) return;

        load();

    }, [pageId]);

    const syncForms = async () => {

        try {

            setSyncing(true);

            await metaService.syncForms(pageId);

            await fetchForms();

        } catch (error) {

            console.error("Sync forms failed", error);

        } finally {

            setSyncing(false);

        }

    };

    const handleMapping = async (formId: string, typeIds: string[]) => {

        setForms(prev =>
            prev.map(form =>
                form.id === formId
                    ? {
                        ...form,
                        leadTypes: leadTypes.filter(t => typeIds.includes(t.id))
                    }
                    : form
            )
        )

        try {
            await externalLeadService.mapMetaForms({
                formId,
                typeIds
            })
        } catch (error) {
            toast.error("Failed to update mapping")
            fetchForms()
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center py-20 min-h-screen">
                <Loader2 className="animate-spin h-6 w-6" />
            </div>
        );
    }

    return (

        <div className="p-8 flex flex-col gap-6 h-full overflow-y-auto">

            {/* Page Details */}

            <Card>

                <CardContent className="p-6 space-y-2">

                    <h1 className="text-lg font-semibold">
                        {page?.page_name}
                    </h1>

                    <p className="text-sm text-muted-foreground">
                        Page ID: {page?.page_id}
                    </p>

                </CardContent>

            </Card>

            {/* Forms Section */}

            <Card className="flex-1">

                <CardContent className="p-6 space-y-6">

                    <div className="flex items-center justify-between">

                        <div>

                            <div className="flex items-center gap-2">

                                <h2 className="font-semibold">
                                    Lead Forms
                                </h2>

                                <Badge>
                                    {forms.length}
                                </Badge>

                            </div>

                            <p className="text-sm text-muted-foreground">
                                Manage lead forms for this page.
                            </p>

                        </div>

                        <Button
                            className="bg-linear-to-r from-[#0064E0] via-[#1C7CFF] to-[#00A3FF] text-white"
                            onClick={syncForms}
                            disabled={syncing}
                        >

                            {syncing ? (
                                <Loader2 className="animate-spin h-4 w-4" />
                            ) : (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Sync Meta Forms
                                </>
                            )}

                        </Button>

                    </div>

                    <Table>

                        <TableHeader>

                            <TableRow>
                                <TableHead>Form Name</TableHead>
                                <TableHead>Form ID</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Mapped Lead Types</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>

                        </TableHeader>

                        <TableBody>

                            {forms.length === 0 && (
                                <TableRow>
                                    <TableCell
                                        colSpan={3}
                                        className="text-center py-6 text-muted-foreground"
                                    >
                                        No forms synced
                                    </TableCell>
                                </TableRow>
                            )}

                            {forms.map(form => (

                                <TableRow key={form.id}>
                                    <TableCell className="font-medium">
                                        {form.form_name}
                                    </TableCell>

                                    <TableCell className="text-muted-foreground">
                                        {form.form_id}
                                    </TableCell>

                                    <TableCell>
                                        {form.status}
                                    </TableCell>

                                    <TableCell>

                                        <LeadTypeSelector
                                            types={leadTypes}
                                            value={form.leadTypes.map(l => l.id)}
                                            onChange={(ids) => handleMapping(form.id, ids)}
                                            onTypeCreated={(lead) => {
                                                setLeadTypes(prev => [...prev, lead])
                                            }}

                                            buttonText="+"
                                        />

                                    </TableCell>

                                    <TableCell>

                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => syncLeads(form.id)}
                                            disabled={syncingLeads === form.id}
                                        >

                                            {syncingLeads === form.id ? (
                                                <Loader2 className="animate-spin h-4 w-4" />
                                            ) : (
                                                "Sync Leads"
                                            )}

                                        </Button>

                                    </TableCell>
                                    
                                </TableRow>

                            ))}

                        </TableBody>

                    </Table>

                </CardContent>

            </Card>

        </div>

    );

}