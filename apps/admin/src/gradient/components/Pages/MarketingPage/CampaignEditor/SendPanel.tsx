"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";

import { campaignService } from "@/gradient/services/campaignService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import type { Campaign } from "@/gradient/types/campaign";

interface Props {
  campaign: Campaign;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

type Mode = "now" | "later";

/** Local `YYYY-MM-DD`. `toISOString().split("T")[0]` is the UTC date, which is
 *  the wrong day for anyone east of Greenwich after ~05:30 IST. */
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

const localTime = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * A date or time field whose whole box opens the picker.
 *
 * Native `date`/`time` inputs only open on the little calendar glyph, which is
 * a ~16px target most people never find — they click the middle of the field,
 * nothing happens, and conclude the control is broken.
 */
function PickerInput({
  type,
  value,
  min,
  disabled,
  onChange,
}: {
  type: "date" | "time";
  value: string;
  min?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <Input
      ref={ref}
      type={type}
      value={value}
      min={min}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onClick={() => {
        // Not supported in every browser, and typing still works where it is
        // not — so this is an enhancement, never the only way in.
        try {
          ref.current?.showPicker?.();
        } catch {
          /* showPicker throws if the input is not user-activated; ignore. */
        }
      }}
      className="cursor-pointer"
    />
  );
}

/**
 * The last screen before several thousand people get an email.
 *
 * A hand-rolled slide-over rather than the `vaul` drawer: vaul attaches pointer
 * handlers to drag the panel, and those swallow the clicks that open a native
 * date or time picker. A panel whose date field cannot be opened is worse than
 * one that does not animate quite as nicely.
 *
 * Nothing on the server gates sending by role — any authenticated admin can do
 * it — so this panel *is* the guardrail. It resolves the audience one more time
 * and states the mailable count and the sender before the button is live. Do
 * not reduce it to a bare "Confirm".
 */
export default function SendPanel({
  campaign,
  open,
  onOpenChange,
  onDone,
}: Props) {
  const [mode, setMode] = useState<Mode>("now");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);

  const todayStr = localDate(new Date());
  const minTime = date === todayStr ? localTime(new Date()) : undefined;

  useEffect(() => {
    if (!open) return;

    setError("");
    setMode(campaign.scheduledAt ? "later" : "now");

    if (campaign.scheduledAt) {
      const d = new Date(campaign.scheduledAt);
      setDate(localDate(d));
      setTime(localTime(d));
    } else {
      setDate("");
      setTime("");
    }

    // Resolve the audience again here rather than trusting a number the admin
    // saw in the preview some minutes ago.
    setCounting(true);
    campaignService
      .preview(campaign.id, { limit: 1 })
      .then((res) => setCount(res.data.totals.mailable))
      .catch(() => setCount(null))
      .finally(() => setCounting(false));
  }, [open, campaign.id, campaign.scheduledAt]);

  // Escape closes, and the page behind must not scroll under the panel.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onOpenChange(false);
    };

    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, submitting, onOpenChange]);

  const handleConfirm = async () => {
    let scheduledAt: string | undefined;

    if (mode === "later") {
      if (!date) return setError("Pick a date.");
      if (!time) return setError("Pick a time.");

      // `${date}T${time}` has no zone, so it is parsed as local time — which is
      // what the admin picked — and toISOString converts it to the UTC instant
      // the API stores. Do not send the naive string.
      const chosen = new Date(`${date}T${time}`);

      if (Number.isNaN(chosen.getTime())) {
        return setError("That date and time could not be read.");
      }

      if (chosen <= new Date()) {
        return setError("That time has already passed.");
      }

      scheduledAt = chosen.toISOString();
    }

    setSubmitting(true);
    setError("");

    try {
      await campaignService.schedule(campaign.id, scheduledAt);

      toast.success(
        mode === "later" ? "Campaign scheduled" : "Campaign is being sent",
      );
      onOpenChange(false);
      onDone();
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to schedule the campaign"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={() => !submitting && onOpenChange(false)}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Send campaign"
        className="bg-background absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b p-4">
          <div>
            <p className="font-semibold">
              {campaign.status === "scheduled" ? "Reschedule" : "Send campaign"}
            </p>
            <p className="text-muted-foreground text-xs">
              This cannot be undone once it starts.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <div>
            <p className="text-3xl font-semibold">
              {counting ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : count === null ? (
                "—"
              ) : (
                count.toLocaleString()
              )}
            </p>
            <p className="text-muted-foreground text-sm">
              people will receive this
            </p>
          </div>

          <div className="bg-muted/40 space-y-1.5 rounded-md border p-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">From</span>
              <span className="truncate font-medium">
                {campaign.senderName} · {campaign.senderEmail}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Subject</span>
              <span className="truncate font-medium">{campaign.subject}</span>
            </div>
          </div>

          {count === 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Nobody currently matches this audience. Sending now would
                deliver nothing.
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-semibold">When</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["now", "Send now"],
                  ["later", "Schedule"],
                ] as [Mode, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setMode(value);
                    setError("");
                  }}
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    mode === value
                      ? "border-primary bg-primary/5 text-foreground"
                      : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {mode === "later" && (
            <div className="flex gap-2">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Date</Label>
                <PickerInput
                  type="date"
                  value={date}
                  min={todayStr}
                  disabled={submitting}
                  onChange={(v) => {
                    setDate(v);
                    setError("");
                  }}
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Time</Label>
                <PickerInput
                  type="time"
                  value={time}
                  min={minTime}
                  disabled={submitting}
                  onChange={(v) => {
                    setTime(v);
                    setError("");
                  }}
                />
              </div>
            </div>
          )}

          {mode === "later" && date && time && !error && (
            <p className="text-muted-foreground text-xs">
              Sends{" "}
              {new Date(`${date}T${time}`).toLocaleString(undefined, {
                dateStyle: "full",
                timeStyle: "short",
              })}
              , your local time.
            </p>
          )}

          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>

        <div className="flex gap-2 border-t p-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {mode === "now"
              ? `Send to ${count?.toLocaleString() ?? "…"}`
              : "Schedule"}
          </Button>
        </div>
      </div>
    </div>
  );
}
