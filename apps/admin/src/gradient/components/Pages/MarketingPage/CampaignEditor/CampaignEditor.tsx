"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Copy,
  Loader2,
  Pencil,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent } from "@/gradient/components/ui/card";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import EmailEditor from "@/gradient/components/ui/EmailEditor/EmailEditor";
import ActivityTimeline from "@/gradient/components/Common/ActivityTimeline/ActivityTimeline";

import { campaignService } from "@/gradient/services/campaignService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_STYLES,
  SOURCE_LABELS,
  type Campaign,
  type CampaignSender,
  type RecipientFilters,
} from "@/gradient/types/campaign";

import AudienceSelector from "./AudienceSelector/AudienceSelector";
import SendPanel from "./SendPanel";
import PerformanceTab from "./PerformanceTab";

type Tab = "content" | "performance" | "history";
type Field = "name" | "sender" | "subject" | "body";

const TABS: { key: Tab; label: string }[] = [
  { key: "content", label: "Content" },
  { key: "performance", label: "Performance" },
  { key: "history", label: "History" },
];

/**
 * One of the four things a campaign needs.
 *
 * The **whole card** is the control, not a link buried inside it: these are
 * four steps to work through, and a card that looks interactive but only
 * responds on one word of text is the kind of thing people click twice and
 * then give up on.
 */
function SettingCard({
  title,
  done,
  summary,
  placeholder,
  disabled,
  onClick,
  children,
}: {
  title: string;
  done: boolean;
  summary?: React.ReactNode;
  placeholder: string;
  disabled?: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  // While it is being edited the card is a form, so it must not also swallow
  // clicks meant for the inputs inside it.
  if (children) {
    return (
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-3">
            {done ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="text-destructive h-5 w-5" />
            )}
            <span className="font-semibold">{title}</span>
          </div>
          {children}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && onClick()}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={
        disabled
          ? "cursor-default"
          : "hover:border-primary/40 focus-visible:ring-ring cursor-pointer transition-colors focus-visible:ring-2 focus-visible:outline-none"
      }
    >
      <CardContent className="flex items-center gap-3 p-5">
        {done ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
        ) : (
          <XCircle className="text-destructive h-5 w-5 shrink-0" />
        )}

        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          <div className="mt-0.5 truncate text-sm">
            {done ? (
              summary
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
        </div>

        {!disabled && (
          <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
        )}
      </CardContent>
    </Card>
  );
}

export default function CampaignEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [senders, setSenders] = useState<CampaignSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("content");

  const [editing, setEditing] = useState<Field | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [audienceOpen, setAudienceOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const locked =
    campaign?.status === "processing" || campaign?.status === "sent";

  const fetchCampaign = useCallback(async () => {
    try {
      setCampaign(await campaignService.get(id));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load the campaign"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCampaign();
    campaignService.senders().then(setSenders).catch(() => setSenders([]));
  }, [fetchCampaign]);

  // A sent campaign has nothing left to edit, so open on the numbers instead.
  useEffect(() => {
    if (campaign && (campaign.status === "sent" || campaign.status === "processing")) {
      setTab("performance");
    }
  }, [campaign?.status]);

  const save = async (patch: Parameters<typeof campaignService.update>[1]) => {
    setSaving(true);
    try {
      setCampaign(await campaignService.update(id, patch));
      setEditing(null);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  const saveAudience = async (recipientFilters: RecipientFilters) => {
    setCampaign(await campaignService.update(id, { recipientFilters }));
  };

  const handleDuplicate = async () => {
    setDuplicating(true);
    try {
      const copy = await campaignService.duplicate(id);
      toast.success(`Copied to "${copy.name}"`);
      router.push(`/marketing/campaigns/${copy.id}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to duplicate the campaign"));
      setDuplicating(false);
    }
  };

  const handleCancel = async () => {
    try {
      await campaignService.cancel(id);
      toast.success("Campaign returned to draft");
      fetchCampaign();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to cancel"));
    }
  };

  const open = (field: Field) => {
    setDraft(field === "body" ? { body: campaign?.body ?? "" } : {});
    setEditing(field);
  };

  if (loading) {
    return (
      <DashboardLayout title="Campaign">
        <div className="flex justify-center py-24">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!campaign) {
    return (
      <DashboardLayout title="Campaign">
        <p className="text-muted-foreground py-24 text-center">
          That campaign no longer exists.
        </p>
      </DashboardLayout>
    );
  }

  const audience = campaign.recipientFilters || { include: [], exclude: [] };
  const hasAudience = (audience.include?.length ?? 0) > 0;

  const missing = [
    !campaign.senderEmail && "Sender",
    !hasAudience && "Recipients",
    !campaign.subject && "Subject",
    !campaign.body && "Email",
  ].filter(Boolean) as string[];

  const editButtons = (onSave: () => void) => (
    <div className="flex gap-2">
      <Button size="sm" disabled={saving} onClick={onSave}>
        {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
        Save
      </Button>
      <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
        Cancel
      </Button>
    </div>
  );

  /* ── Top bar ────────────────────────────────────────────────────────────
     The campaign's identity and its irreversible action live in the app's own
     header rather than a second header inside the page — two stacked headers
     is what this looked like before, and the page one always won. */
  const title = (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => router.push("/marketing/campaigns")}
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>

      {editing === "name" ? (
        <span className="flex items-center gap-2">
          <Input
            autoFocus
            value={draft.name ?? campaign.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && save({ name: draft.name })}
            className="h-8 w-56"
          />
          <Button size="sm" onClick={() => save({ name: draft.name })} disabled={saving}>
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </span>
      ) : (
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{campaign.name}</span>
          {!locked && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => {
                setDraft({ name: campaign.name });
                setEditing("name");
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </span>
      )}

      <Badge
        variant="outline"
        className={`shrink-0 text-xs font-medium ${CAMPAIGN_STATUS_STYLES[campaign.status]}`}
      >
        {CAMPAIGN_STATUS_LABELS[campaign.status]}
      </Badge>

      {campaign.status === "scheduled" && campaign.scheduledAt && (
        <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-normal text-blue-700 lg:flex">
          <CalendarClock className="h-3.5 w-3.5" />
          {new Date(campaign.scheduledAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </span>
      )}
    </>
  );

  const actions = (
    <>
      <Button variant="outline" onClick={handleDuplicate} disabled={duplicating}>
        {duplicating ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Copy className="mr-2 h-4 w-4" />
        )}
        Duplicate
      </Button>

      <Button
        variant="outline"
        onClick={() => router.push(`/marketing/campaigns/${id}/preview`)}
      >
        Preview &amp; test
      </Button>

      {campaign.status === "scheduled" && (
        <Button variant="outline" onClick={handleCancel}>
          Cancel send
        </Button>
      )}

      {!locked && (
        <Button
          onClick={() => {
            if (missing.length) {
              toast.error(`Still needed: ${missing.join(", ")}`);
              return;
            }
            setSendOpen(true);
          }}
        >
          {campaign.status === "scheduled" ? "Reschedule" : "Send"}
        </Button>
      )}
    </>
  );

  return (
    <DashboardLayout title={title} actions={actions}>
      <div className="mx-auto max-w-4xl space-y-4">
        {/* Tabs — hand-rolled; this panel has no Tabs primitive. */}
        <div className="bg-muted/50 flex w-full gap-1 rounded-lg border p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "performance" && (
          <PerformanceTab campaign={campaign} onChanged={fetchCampaign} />
        )}

        {tab === "history" && (
          <ActivityTimeline entityType="campaign" entityId={campaign.id} />
        )}

        {tab === "content" && (
          <div className="space-y-3">
            {locked && (
              <div className="text-muted-foreground bg-muted/40 rounded-md border p-3 text-sm">
                {campaign.status === "processing"
                  ? "This campaign is sending. It cannot be edited until it finishes."
                  : "This campaign has been sent. It is kept as a record and cannot be edited — duplicate it to send something similar."}
              </div>
            )}

            {missing.length > 0 && !locked && (
              <div className="border-destructive/30 bg-destructive/5 rounded-md border p-4">
                <p className="text-destructive text-sm font-semibold">
                  Not ready to send
                </p>
                <p className="text-destructive/80 mt-1 text-sm">
                  Still needed: {missing.join(", ")}
                </p>
              </div>
            )}

            {/* Sender */}
            <SettingCard
              title="Sender"
              done={Boolean(campaign.senderEmail)}
              placeholder="Choose who this comes from"
              disabled={locked}
              onClick={() => open("sender")}
              summary={
                <>
                  <b>{campaign.senderName}</b> · {campaign.senderEmail}
                </>
              }
            >
              {editing === "sender" ? (
                <div className="max-w-md space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">From address</Label>
                    <Select
                      value={draft.senderEmail ?? campaign.senderEmail ?? ""}
                      onValueChange={(v) => setDraft({ ...draft, senderEmail: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a verified sender" />
                      </SelectTrigger>
                      <SelectContent>
                        {senders.map((s) => (
                          <SelectItem key={s.email} value={s.email}>
                            {s.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Display name</Label>
                    <Input
                      value={draft.senderName ?? campaign.senderName ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, senderName: e.target.value })
                      }
                      placeholder="Gradient Learnings"
                    />
                  </div>

                  {editButtons(() =>
                    save({
                      senderEmail:
                        draft.senderEmail ?? campaign.senderEmail ?? undefined,
                      senderName:
                        draft.senderName ?? campaign.senderName ?? undefined,
                    }),
                  )}
                </div>
              ) : undefined}
            </SettingCard>

            {/* Recipients */}
            <SettingCard
              title="Recipients"
              done={hasAudience}
              placeholder="Choose who receives this"
              disabled={locked && !hasAudience}
              onClick={() => setAudienceOpen(true)}
              summary={audience.include
                .map((c) => SOURCE_LABELS[c.type] || c.type)
                .join(", ")}
            />

            {/* Subject */}
            <SettingCard
              title="Subject"
              done={Boolean(campaign.subject)}
              placeholder="Write a subject line"
              disabled={locked}
              onClick={() => open("subject")}
              summary={campaign.subject}
            >
              {editing === "subject" ? (
                <div className="max-w-xl space-y-3">
                  <Input
                    autoFocus
                    value={draft.subject ?? campaign.subject ?? ""}
                    onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                    placeholder="Subject line"
                  />
                  <p className="text-muted-foreground text-xs">
                    {"{{name}}"} is replaced with each recipient&apos;s name.
                  </p>
                  {editButtons(() => save({ subject: draft.subject }))}
                </div>
              ) : undefined}
            </SettingCard>

            {/* Email body */}
            <SettingCard
              title="Email"
              done={Boolean(campaign.body)}
              placeholder="Write the email"
              disabled={locked}
              onClick={() => open("body")}
              summary="Email content added"
            >
              {editing === "body" ? (
                <div className="space-y-3">
                  <p className="text-muted-foreground text-xs">
                    {"{{name}}"} is replaced per recipient. An unsubscribe footer
                    is added automatically — do not write your own.
                  </p>

                  <EmailEditor
                    value={draft.body ?? campaign.body ?? ""}
                    onChange={(val) => setDraft({ ...draft, body: val })}
                  />

                  {editButtons(() => save({ body: draft.body }))}
                </div>
              ) : undefined}
            </SettingCard>
          </div>
        )}
      </div>

      <AudienceSelector
        open={audienceOpen}
        onOpenChange={setAudienceOpen}
        value={audience}
        onSave={saveAudience}
        readOnly={locked}
      />

      <SendPanel
        campaign={campaign}
        open={sendOpen}
        onOpenChange={setSendOpen}
        onDone={fetchCampaign}
      />
    </DashboardLayout>
  );
}
