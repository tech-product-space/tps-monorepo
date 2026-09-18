"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent } from "@/gradient/components/ui/card";

import { campaignService } from "@/gradient/services/campaignService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import type { Campaign, CampaignStats } from "@/gradient/types/campaign";

interface Props {
  campaign: Campaign;
  onChanged: () => void;
}

const Tile = ({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "good" | "bad";
}) => (
  <div className="rounded-lg border p-4">
    <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
      {label}
    </p>
    <p
      className={`mt-1 text-2xl font-semibold ${
        tone === "good" ? "text-green-700" : tone === "bad" ? "text-destructive" : ""
      }`}
    >
      {typeof value === "number" ? value.toLocaleString() : value}
    </p>
    {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
  </div>
);

const formatDuration = (ms: number | null) => {
  if (!ms || ms < 1000) return "—";
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return mins ? `${mins}m ${secs}s` : `${secs}s`;
};

/**
 * What happened to the send.
 *
 * Delivery, the audience funnel, and failures grouped by reason. Opens and
 * clicks are not here because they are not collected — no tracking pixel, no
 * click redirects — and a panel showing an empty "Opens" tile would imply the
 * number was zero rather than absent.
 */
export default function PerformanceTab({ campaign, onChanged }: Props) {
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    try {
      setStats(await campaignService.stats(campaign.id));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load campaign stats"));
    } finally {
      setLoading(false);
    }
  }, [campaign.id]);

  useEffect(() => {
    load();
  }, [load]);

  // While a send is running this is a live progress view — the only thing an
  // admin has to look at during a long send.
  useEffect(() => {
    if (campaign.status !== "processing") return;

    const timer = setInterval(() => {
      load();
      onChanged();
    }, 5000);

    return () => clearInterval(timer);
  }, [campaign.status, load, onChanged]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const res = await campaignService.retryFailed(campaign.id);
      toast.success(res.message || "Retrying failed recipients");
      await load();
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to retry"));
    } finally {
      setRetrying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!stats) return null;

  // `reaction` and `outcome` are still returned by /campaigns/:id/stats and are
  // deliberately not rendered — the Outcome section was removed. Left on the
  // response so turning it back on is a UI change, not a backend one.
  const { audience, delivery, failures, window } = stats;

  return (
    <div className="space-y-6">
      {campaign.status === "processing" && (
        <div className="flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="flex-1">
            Sending — {delivery.sent.toLocaleString()} of{" "}
            {(audience.resolved - audience.suppressed).toLocaleString()} done
          </span>
          <span className="font-semibold">{delivery.progress}%</span>
        </div>
      )}

      {/* Delivery */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Delivery</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile
            label="Sent"
            value={delivery.sent}
            hint={`${delivery.deliveryRate}% of attempted`}
          />
          <Tile
            label="Failed"
            value={delivery.failed}
            tone={delivery.failed > 0 ? "bad" : "default"}
          />
          <Tile label="Unsubscribed before send" value={audience.suppressed} />
          <Tile label="Send window" value={formatDuration(window.durationMs)} />
        </div>
        <p className="text-muted-foreground text-xs">
          Sent means accepted by the mail provider. Bounces are not tracked yet,
          so a delivered count is not proof it reached an inbox.
        </p>
      </section>

      {/* Audience funnel */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Audience</h3>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
            <span>
              <b>{audience.resolved.toLocaleString()}</b> resolved
            </span>
            <span className="text-muted-foreground">−</span>
            <span>
              <b>{audience.suppressed.toLocaleString()}</b> unsubscribed
            </span>
            <span className="text-muted-foreground">=</span>
            <span>
              <b>
                {(audience.resolved - audience.suppressed).toLocaleString()}
              </b>{" "}
              mailable
            </span>
            {audience.queued > 0 && (
              <span className="text-muted-foreground ml-auto">
                {audience.queued.toLocaleString()} still queued
              </span>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Failures, grouped */}
      {failures.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Failures</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={retrying || campaign.status === "processing"}
            >
              {retrying ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-3.5 w-3.5" />
              )}
              Retry failed
            </Button>
          </div>

          {/* Grouped by reason: "63 × address is not verified" is a fixable
              configuration problem; "63 failures" is a shrug. */}
          <div className="space-y-1">
            {failures.map((f) => (
              <div
                key={f.error}
                className="flex items-start justify-between gap-4 rounded border px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground break-all">{f.error}</span>
                <span className="shrink-0 font-semibold">
                  {f.count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <Button variant="ghost" size="sm" onClick={load}>
        <RefreshCw className="mr-2 h-3.5 w-3.5" />
        Refresh
      </Button>
    </div>
  );
}
