"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/gradient/components/ui/button";
import { Switch } from "@/gradient/components/ui/switch";
import { eventFeedbackService } from "@/gradient/services/eventFeedbackService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";

interface FeedbackHeaderProps {
  eventId: string;
  eventSlug: string;
  initialAcceptResponse: boolean;
}

const PUBLIC_SITE =
  process.env.NEXT_PUBLIC_SITE_URL || "https://gradientlearnings.org";

export default function FeedbackHeader({
  eventId,
  eventSlug,
  initialAcceptResponse,
}: FeedbackHeaderProps) {
  const [accepting, setAccepting] = useState(initialAcceptResponse);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = `${PUBLIC_SITE}/events/${eventSlug}/feedback`;

  const handleToggle = async (next: boolean) => {
    setSaving(true);
    // Optimistic: the switch is the whole point of the control, so it should
    // move when clicked. Reverted below if the call fails.
    setAccepting(next);

    try {
      const data = await eventFeedbackService.toggleAcceptResponse(eventId, next);
      setAccepting(data.canAcceptResponse);
      toast.success(
        data.canAcceptResponse ? "Responses are now open" : "Responses are now closed",
      );
    } catch (error) {
      setAccepting(!next);
      toast.error(getApiErrorMessage(error, "Could not update responses"));
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Feedback link copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Accept responses</span>
            {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground">
            While this is on, anyone with the link can submit — and people not on
            the guest list can register themselves and be approved automatically.
          </p>
        </div>

        <Switch
          checked={accepting}
          onCheckedChange={handleToggle}
          disabled={saving}
        />
      </div>

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Feedback link — one link for everyone
        </span>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 text-xs">
            {url}
          </code>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
