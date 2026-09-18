"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { campaignService } from "@/services/campaign/campaignService";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

const PAGE_SIZE = 10;

const PreviewPage = () => {
    const { id } = useParams();
    const router = useRouter();
    

    const [campaign, setCampaign] = useState<any>(null);
    const [recipients, setRecipients] = useState<any[]>([]);
    const [page, setPage] = useState(1);

    const [testEmail, setTestEmail] = useState("");
    const [testName, setTestName] = useState("");

    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchPreview = async () => {
        try {
            setLoading(true);
            setError(null);

            const data = await campaignService.previewRecipients(id as string);

            setCampaign(data.campaign);
            setRecipients(data.recipients || []);

        } catch (err: any) {
            console.error(err);
            setError("Failed to load preview");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPreview();
    }, []);

    const sendTestMail = async () => {

        if (!testEmail) {
            toast.error("Please enter test email");
            return;
        }

        try {
            setSending(true);

            await campaignService.sendTestMail(id as string, {
                email: testEmail,
                name: testName,
            });

            toast.success("Test email sent!");

        } catch (err: any) {
            console.error(err);
            toast.error("Failed to send test email");
        } finally {
            setSending(false);
        }
    };

    if (loading) {
        return (
            <div className="p-10 text-center text-muted-foreground min-h-screen flex justify-center items-center gap-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                Loading campaign preview...
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-10 text-center text-red-500 min-h-screen flex justify-center items-center">
                {error}
            </div>
        );
    }

    if (!campaign) return null;

    const start = (page - 1) * PAGE_SIZE;
    const paginatedRecipients = recipients.slice(start, start + PAGE_SIZE);
    const totalPages = Math.ceil(recipients.length / PAGE_SIZE);

    return (
        <div className="flex gap-6 p-6 pb-20 overflow-scroll h-full">

            {/* Left side */}

            <div className="flex-1 space-y-6">

                {/* Campaign Details */}

                <Card>

                    <CardHeader>
                        <div className="text-xl font-semibold">

                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => router.back()}
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </Button>

                            Campaign Preview
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-3">

                        <div>
                            <b>Name:</b> {campaign.name}
                        </div>

                        <div>
                            <b>Sender:</b> {campaign.sender_name} · {campaign.sender_email}
                        </div>

                        <div>
                            <b>Subject:</b> {campaign.subject}
                        </div>

                        <div>
                            <b>Total Recipients:</b> {recipients.length}
                        </div>

                    </CardContent>

                </Card>

                {/* Recipients */}

                <Card>

                    <CardHeader>
                        <div className="text-lg font-semibold">
                            Recipients Preview
                        </div>
                    </CardHeader>

                    <CardContent>

                        {recipients.length === 0 ? (
                            <div className="text-sm text-muted-foreground">
                                No recipients found for this campaign.
                            </div>
                        ) : (
                            <>
                                <table className="w-full text-sm">

                                    <thead className="border-b">

                                        <tr className="text-left">
                                            <th className="py-2">Name</th>
                                            <th>Email</th>
                                            <th>Source</th>
                                        </tr>

                                    </thead>

                                    <tbody>

                                        {paginatedRecipients.map((r, index) => (
                                            <tr key={index} className="border-b">

                                                <td className="py-2">{r.name}</td>
                                                <td>{r.email}</td>
                                                <td>{r.source_type}</td>

                                            </tr>
                                        ))}

                                    </tbody>

                                </table>

                                {/* Pagination */}

                                <div className="flex justify-between items-center mt-4">

                                    <Button
                                        disabled={page === 1}
                                        onClick={() => setPage(page - 1)}
                                    >
                                        Previous
                                    </Button>

                                    <div>
                                        Page {page} / {totalPages || 1}
                                    </div>

                                    <Button
                                        disabled={page === totalPages}
                                        onClick={() => setPage(page + 1)}
                                    >
                                        Next
                                    </Button>

                                </div>
                            </>
                        )}

                    </CardContent>

                </Card>

            </div>

            {/* Right side */}

            <div className="w-[320px]">

                <Card>

                    <CardHeader>
                        <div className="text-lg font-semibold">
                            Send Test Email
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-4">

                        <div className="space-y-2">

                            <Label>Test Email</Label>

                            <Input
                                placeholder="admin@example.com"
                                value={testEmail}
                                onChange={(e) => setTestEmail(e.target.value)}
                            />

                        </div>

                        <div className="space-y-2">

                            <Label>Name</Label>

                            <Input
                                placeholder="Admin"
                                value={testName}
                                onChange={(e) => setTestName(e.target.value)}
                            />

                        </div>

                        <Button
                            className="w-full"
                            disabled={sending}
                            onClick={sendTestMail}
                        >
                            {sending ? "Sending..." : "Send Test Email"}
                        </Button>

                    </CardContent>

                </Card>

            </div>

        </div>
    );
};

export default PreviewPage;