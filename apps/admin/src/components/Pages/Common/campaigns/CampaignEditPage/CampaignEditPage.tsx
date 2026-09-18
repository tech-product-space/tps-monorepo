"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { campaignService } from "@/services/campaign/campaignService";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import {
    ArrowLeft,
    CalendarClock,
    CheckCircle2,
    Loader2,
    Pencil,
    XCircle,
    Copy,
    ClipboardPaste,
} from "lucide-react";

import { toast } from "sonner";

import EmailTextEditor3 from "@/components/Rich-Text-Editor/EmailTextEditor3";
import LeadSelector from "../../marketing/LeadSelector/LeadSelector";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CampaignStatus } from "@/types/campaign";

const senderOptions = [
    "noreply@theproductspace.in",
    "info@theproductspace.in",
    "akhil@theproductspace.in",
    "info@thegradient.co.in",
    "noreply@gradientlearnings.org",

];

// ── Status badge colour mapping ──────────────────────────────────────────────
const statusConfig: Record<string, { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-zinc-100 text-zinc-600 border-zinc-200" },
    scheduled: { label: "Scheduled", className: "bg-blue-100 text-blue-700 border-blue-200" },
    sending: { label: "Sending", className: "bg-amber-100 text-amber-700 border-amber-200" },
    sent: { label: "Sent", className: "bg-green-100 text-green-700 border-green-200" },
};

export const StatusBadge = ({ status }: { status: CampaignStatus }) => {
    const cfg = statusConfig[status] ?? { label: status, className: "bg-zinc-100 text-zinc-600 border-zinc-200" };
    return (
        <Badge
            variant="outline"
            className={`capitalize font-medium px-2.5 py-0.5 ${cfg.className}`}
        >
            {cfg.label}
        </Badge>
    );
};

// ── Scheduled-at formatter ───────────────────────────────────────────────────
const formatScheduledAt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    });
};

// ── Component ────────────────────────────────────────────────────────────────
const CampaignEditPage = () => {
    const { id } = useParams();
    const router = useRouter();

    const [campaign, setCampaign] = useState<any>(null);

    const [editingName, setEditingName] = useState(false);
    const [campaignName, setCampaignName] = useState("");

    const [editingSender, setEditingSender] = useState(false);
    const [editingSubject, setEditingSubject] = useState(false);
    const [editingEmail, setEditingEmail] = useState(false);

    const [senderName, setSenderName] = useState("Product Space");
    const [senderEmail, setSenderEmail] = useState("");

    const [subject, setSubject] = useState("");
    const [content, setContent] = useState("");

    const [showValidation, setShowValidation] = useState(false);
    const [missingSections, setMissingSections] = useState<string[]>([]);

    const [leadSelectorOpen, setLeadSelectorOpen] = useState(false);
    const [recipientFilters, setRecipientFilters] = useState<any>(null);

    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [scheduleMode, setScheduleMode] = useState<"now" | "later" | "cancel">("later");
    const [scheduleLoading, setScheduleLoading] = useState(false);
    const [scheduleError, setScheduleError] = useState("");

    const [scheduleDate, setScheduleDate] = useState("");
    const [scheduleTime, setScheduleTime] = useState("");

    // Minimum date = today (prevent selecting past dates)
    const todayStr = new Date().toISOString().split("T")[0];

    // Minimum time = current HH:MM, but only when the chosen date is today
    const nowTimeStr = () => {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    };
    const minTime = scheduleDate === todayStr ? nowTimeStr() : undefined;

    const fetchCampaign = async () => {
        const data = await campaignService.getCampaign(id as string);

        setCampaign(data);

        setCampaignName(data.name);
        setSenderName(data.sender_name || "Product Space");
        setSenderEmail(data.sender_email || "");
        setSubject(data.subject || "");
        setContent(data.content || "");
        setRecipientFilters(data.recipient_filters || { sources: [] });
    };

    const handleCopyContent = () => {
        if (!content) {
            toast.error("Nothing to copy");
            return;
        }
        localStorage.setItem("ps_copied_campaign_content", content);
        navigator.clipboard.writeText(content).catch(() => {
            // Fallback if clipboard API fails
        });
        toast.success("Content copied to clipboard");
    };

    const handlePasteContent = () => {
        const saved = localStorage.getItem("ps_copied_campaign_content");
        if (saved) {
            setContent(saved);
            toast.success("Content pasted from clipboard");
        } else {
            toast.error("No saved content found to paste");
        }
    };

    useEffect(() => {
        fetchCampaign();
    }, []);

    const updateCampaign = async (payload: any) => {
        await campaignService.updateCampaign(id as string, payload);
        fetchCampaign();
    };

    const updateCampaignName = async () => {
        await updateCampaign({ name: campaignName });
        setEditingName(false);
    };

    const validateCampaign = () => {
        const missing: string[] = [];

        if (!campaign.sender_email) missing.push("Sender");
        if (!campaign.recipient_filters) missing.push("Recipients");
        if (!campaign.subject) missing.push("Subject");
        if (!campaign.content) missing.push("Email");

        setMissingSections(missing);

        if (missing.length > 0) {
            setShowValidation(true);
            return false;
        }

        return true;
    };

    if (!campaign) return null;

    return (
        <div className="w-full space-y-6 overflow-scroll pb-20 h-full">

            {/* Header */}
            <div className="flex items-center justify-between border-b px-8 pt-6 pb-4">

                <div className="flex items-center gap-4">

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.back()}
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>

                    {!editingName ? (
                        <div className="flex items-center gap-3">

                            <h1 className="text-2xl font-semibold">
                                {campaignName}
                            </h1>

                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditingName(true)}
                            >
                                <Pencil className="h-4 w-4" />
                            </Button>

                            <StatusBadge status={campaign.status} />

                            {/* ── Scheduled-at pill (only when status = scheduled) ── */}
                            {campaign.status === "scheduled" && campaign.scheduled_at && (
                                <div className="flex items-center gap-1.5 text-sm text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-3 py-0.5">
                                    <CalendarClock className="h-3.5 w-3.5" />
                                    <span>{formatScheduledAt(campaign.scheduled_at)}</span>
                                </div>
                            )}

                        </div>
                    ) : (
                        <div className="flex items-center gap-2">

                            <Input
                                value={campaignName}
                                onChange={(e) => setCampaignName(e.target.value)}
                                className="w-64"
                            />

                            <Button size="sm" onClick={updateCampaignName}>
                                Save
                            </Button>

                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    setEditingName(false);
                                    setCampaignName(campaign.name);
                                }}
                            >
                                Cancel
                            </Button>

                        </div>
                    )}

                </div>

                <div className="flex gap-3">

                    <Button
                        variant="outline"
                        onClick={() => {
                            if (validateCampaign()) {
                                router.push(`preview`)
                            }
                        }}
                    >
                        Preview & Test
                    </Button>

                    <Button
                        onClick={() => {
                            if (validateCampaign()) {
                                // Pre-fill date/time from campaign.scheduled_at if present, else clear
                                if (campaign.scheduled_at) {
                                    const d = new Date(campaign.scheduled_at);
                                    setScheduleDate(d.toISOString().split("T")[0]);
                                    setScheduleTime(
                                        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
                                    );
                                } else {
                                    setScheduleDate("");
                                    setScheduleTime("");
                                    setScheduleMode("later");
                                }
                                setScheduleError("");
                                setScheduleOpen(true);
                            }
                        }}
                    >
                        Schedule
                    </Button>

                </div>

            </div>

            {/* Validation Card */}
            {showValidation && (
                <Card className="mx-8 border-red-300 bg-red-50">
                    <CardContent className="py-5">

                        <div className="font-semibold text-red-700">
                            Campaign is not ready yet
                        </div>

                        <p className="text-sm text-red-600 mt-1">
                            Please complete the following sections before sending.
                        </p>

                        <ul className="mt-3 list-disc list-inside text-sm text-red-700">
                            {missingSections.map((section) => (
                                <li key={section}>{section}</li>
                            ))}
                        </ul>

                        <div className="mt-4">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowValidation(false)}
                            >
                                Close
                            </Button>
                        </div>

                    </CardContent>
                </Card>
            )}

            {/* Content */}
            <div className="w-full max-w-8xl px-8 space-y-6">

                {/* Sender Card */}
                <Card
                    className="cursor-pointer"
                    onClick={() => !editingSender && setEditingSender(true)}
                >

                    <CardHeader className="flex flex-row items-center gap-3">

                        {campaign.sender_email ? (
                            <CheckCircle2 className="text-green-500" />
                        ) : (
                            <XCircle className="text-red-500" />
                        )}

                        <div className="text-lg font-semibold">
                            Sender
                        </div>

                    </CardHeader>

                    <CardContent className="space-y-4">

                        {!editingSender && (
                            <div>
                                <b>{campaign.sender_name}</b> · {campaign.sender_email}
                            </div>
                        )}

                        {editingSender && (
                            <div className="space-y-5 max-w-[400px]">

                                <div className="space-y-2">
                                    <Label>Sender Email</Label>

                                    <Select
                                        value={senderEmail}
                                        onValueChange={(value) => setSenderEmail(value)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select sender email" />
                                        </SelectTrigger>

                                        <SelectContent>
                                            {senderOptions.map((email) => (
                                                <SelectItem key={email} value={email}>
                                                    {email}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                </div>

                                <div className="space-y-2">
                                    <Label>Sender Name</Label>

                                    <Input
                                        value={senderName}
                                        onChange={(e) => setSenderName(e.target.value)}
                                        placeholder="Product Space"
                                    />
                                </div>

                                <div className="flex gap-2 pt-2">

                                    <Button
                                        onClick={() => {
                                            updateCampaign({
                                                sender_name: senderName,
                                                sender_email: senderEmail,
                                            });

                                            setEditingSender(false);
                                        }}
                                    >
                                        Save
                                    </Button>

                                    <Button
                                        variant="outline"
                                        onClick={() => setEditingSender(false)}
                                    >
                                        Cancel
                                    </Button>

                                </div>

                            </div>
                        )}

                    </CardContent>

                </Card>

                {/* Recipients */}
                <Card onClick={() => setLeadSelectorOpen(true)} className="cursor-pointer">

                    <CardHeader className="flex items-center gap-3">

                        {campaign.recipient_filters ? (
                            <CheckCircle2 className="text-green-500" />
                        ) : (
                            <XCircle className="text-red-500" />
                        )}

                        <div className="text-lg font-semibold">
                            Recipients
                        </div>

                    </CardHeader>

                    <CardContent>
                        {campaign.recipient_filters
                            ? "Recipients selected"
                            : "Click to select recipients"}

                        <div onClick={(e) => e.stopPropagation()}>
                            <LeadSelector
                                open={leadSelectorOpen}
                                onOpenChange={setLeadSelectorOpen}
                                value={recipientFilters}
                                onChange={async (filters) => {
                                    setRecipientFilters(filters);
                                    await updateCampaign({ recipient_filters: filters });
                                    setLeadSelectorOpen(false);
                                }}
                            />
                        </div>
                    </CardContent>

                </Card>

                {/* Subject */}
                <Card
                    className="cursor-pointer"
                    onClick={() => !editingSubject && setEditingSubject(true)}
                >

                    <CardHeader className="flex items-center gap-3">

                        {campaign.subject ? (
                            <CheckCircle2 className="text-green-500" />
                        ) : (
                            <XCircle className="text-red-500" />
                        )}

                        <div className="text-lg font-semibold">
                            Subject
                        </div>

                    </CardHeader>

                    <CardContent className="space-y-4">

                        {!editingSubject && (
                            <div>
                                <b>Subject:</b> {campaign.subject || "Not set"}
                            </div>
                        )}

                        {editingSubject && (
                            <div className="space-y-4 max-w-[400px]">

                                <Input
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="Email subject"
                                />

                                <div className="text-sm text-muted-foreground">
                                    You can use variable: {"{{name}}"}
                                </div>

                                <div className="flex gap-2">

                                    <Button
                                        onClick={() => {
                                            updateCampaign({ subject });
                                            setEditingSubject(false);
                                        }}
                                    >
                                        Save
                                    </Button>

                                    <Button
                                        variant="outline"
                                        onClick={() => setEditingSubject(false)}
                                    >
                                        Cancel
                                    </Button>

                                </div>

                            </div>
                        )}

                    </CardContent>

                </Card>

                {/* Email */}
                <Card
                    className="cursor-pointer"
                    onClick={() => !editingEmail && setEditingEmail(true)}
                >

                    <CardHeader className="flex items-center gap-3">

                        {campaign.content ? (
                            <CheckCircle2 className="text-green-500" />
                        ) : (
                            <XCircle className="text-red-500" />
                        )}

                        <div className="text-lg font-semibold">
                            Email
                        </div>

                    </CardHeader>

                    <CardContent className="space-y-4">

                        {!editingEmail && (
                            <div>
                                {campaign.content
                                    ? "Email content added"
                                    : "No email content yet"}
                            </div>
                        )}

                        {editingEmail && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm text-muted-foreground">
                                        You can use variable: {"{{name}}"}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleCopyContent();
                                            }}
                                            className="h-8 gap-1.5"
                                        >
                                            <Copy className="h-3.5 w-3.5" />
                                            Copy Content
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handlePasteContent();
                                            }}
                                            className="h-8 gap-1.5"
                                        >
                                            <ClipboardPaste className="h-3.5 w-3.5" />
                                            Paste Content
                                        </Button>
                                    </div>
                                </div>

                                <EmailTextEditor3
                                    value={content}
                                    onChange={(val: string) => setContent(val)}
                                />

                                <div className="flex gap-2">

                                    <Button
                                        onClick={() => {
                                            updateCampaign({ content });
                                            setEditingEmail(false);
                                        }}
                                    >
                                        Save
                                    </Button>

                                    <Button
                                        variant="outline"
                                        onClick={() => setEditingEmail(false)}
                                    >
                                        Cancel
                                    </Button>

                                </div>

                            </div>
                        )}

                    </CardContent>

                </Card>

            </div>

            {/* ── Schedule Sheet ─────────────────────────────────────────────── */}
            <Sheet open={scheduleOpen} onOpenChange={(open) => {
                if (scheduleLoading) return;
                if (!open) {
                    setScheduleDate("");
                    setScheduleTime("");
                    setScheduleError("");
                }
                setScheduleOpen(open);
            }}>
                <SheetContent side="right" className="w-[420px]">

                    <SheetHeader>
                        <SheetTitle>Campaign Scheduling</SheetTitle>
                    </SheetHeader>

                    <div className="space-y-6 mt-6">

                        {/* Mode selection */}
                        <div className="space-y-3">

                            <Label>Choose Action</Label>

                            <div className="flex flex-col gap-3">

                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="scheduleMode"
                                        checked={scheduleMode === "now"}
                                        onChange={() => setScheduleMode("now")}
                                        disabled={scheduleLoading}
                                    />
                                    Send Now
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="scheduleMode"
                                        checked={scheduleMode === "later"}
                                        onChange={() => setScheduleMode("later")}
                                        disabled={scheduleLoading}
                                    />
                                    Schedule for Later
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="scheduleMode"
                                        checked={scheduleMode === "cancel"}
                                        onChange={() => setScheduleMode("cancel")}
                                        disabled={scheduleLoading}
                                    />
                                    Cancel Scheduled Campaign
                                </label>

                            </div>

                        </div>

                        {/* Schedule inputs */}
                        {scheduleMode === "later" && (
                            <div className="space-y-4">

                                <div className="space-y-2">
                                    <Label>Date</Label>
                                    <Input
                                        type="date"
                                        value={scheduleDate}
                                        min={todayStr}
                                        onChange={(e) => {
                                            setScheduleDate(e.target.value);
                                            setScheduleTime("");
                                            setScheduleError("");
                                        }}
                                        disabled={scheduleLoading}
                                        className={scheduleError === "missing-date" ? "border-red-400 focus-visible:ring-red-400" : ""}
                                    />
                                    {scheduleError === "missing-date" && (
                                        <p className="text-xs text-red-500 mt-1">Please select a date.</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label>Time</Label>
                                    <Input
                                        type="time"
                                        value={scheduleTime}
                                        min={minTime}
                                        onChange={(e) => {
                                            setScheduleTime(e.target.value);
                                            setScheduleError("");
                                        }}
                                        disabled={scheduleLoading}
                                        className={scheduleError === "missing-time" || scheduleError === "Scheduled time must be in the future." ? "border-red-400 focus-visible:ring-red-400" : ""}
                                    />
                                    {scheduleError === "missing-time" && (
                                        <p className="text-xs text-red-500 mt-1">Please select a time.</p>
                                    )}
                                    {scheduleError === "Scheduled time must be in the future." && (
                                        <p className="text-xs text-red-500 mt-1">Scheduled time must be in the future.</p>
                                    )}
                                </div>

                            </div>
                        )}

                        {scheduleMode === "cancel" && (
                            <div className="text-sm text-muted-foreground">
                                This will cancel the scheduled campaign and move it back to draft.
                            </div>
                        )}

                    </div>

                    <SheetFooter className="mt-8">

                        <Button
                            variant="outline"
                            onClick={() => setScheduleOpen(false)}
                            disabled={scheduleLoading}
                        >
                            Close
                        </Button>

                        <Button
                            disabled={scheduleLoading}
                            onClick={async () => {
                                // Validate "later" mode before hitting the API
                                if (scheduleMode === "later") {
                                    if (!scheduleDate) {
                                        setScheduleError("missing-date");
                                        return;
                                    }
                                    if (!scheduleTime) {
                                        setScheduleError("missing-time");
                                        return;
                                    }
                                    const chosen = new Date(`${scheduleDate}T${scheduleTime}`);
                                    if (chosen <= new Date()) {
                                        setScheduleError("Scheduled time must be in the future.");
                                        return;
                                    }
                                }

                                setScheduleError("");
                                setScheduleLoading(true);

                                try {
                                    if (scheduleMode === "now") {
                                        await campaignService.scheduleCampaign(id as string, {});
                                    }

                                    if (scheduleMode === "later") {
                                        const scheduled_at = new Date(
                                            `${scheduleDate}T${scheduleTime}`
                                        ).toISOString();
                                        await campaignService.scheduleCampaign(id as string, {
                                            scheduled_at,
                                        });
                                    }

                                    if (scheduleMode === "cancel") {
                                        await campaignService.cancelCampaign(id as string);
                                    }

                                    await fetchCampaign();
                                    // Clear inputs so stale values don't show next time
                                    setScheduleDate("");
                                    setScheduleTime("");
                                    setScheduleOpen(false);
                                } finally {
                                    setScheduleLoading(false);
                                }
                            }}
                        >
                            {scheduleLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Please wait…
                                </>
                            ) : (
                                "Confirm"
                            )}
                        </Button>

                    </SheetFooter>

                </SheetContent>
            </Sheet>

        </div>
    );
};

export default CampaignEditPage;