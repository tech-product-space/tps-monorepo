"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Switch } from "@/gradient/components/ui/switch";
import { eventFeedbackService } from "@/gradient/services/eventFeedbackService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { EventSettings } from "@/gradient/types/eventFeedback";
import ReadinessBanner from "./ReadinessBanner";

/**
 * Mirrors `EVENT_SETTINGS_DEFAULTS`. Every one of these is on by default, so the
 * wording describes what turning it **off** costs — that is the decision being
 * made here, and it is the direction that surprises people.
 */
const SWITCHES: {
  key: keyof EventSettings;
  label: string;
  help: string;
}[] = [
  {
    key: "autoIssueCertificate",
    label: "Issue certificates automatically",
    help: "A feedback submission immediately issues certificates to the submitter and every teammate they name. Off means they wait for you to generate them from the Feedback tab.",
  },
  {
    key: "allowSelfRegistrationOnFeedback",
    label: "Let unregistered people register from the feedback link",
    help: "Someone who attended but never signed up can add their details and be approved on the spot. Off means an unknown email is turned away with nothing to do.",
  },
  {
    key: "promoteWaitlistedOnFeedback",
    label: "Approve waitlisted guests who submit feedback",
    help: "Someone left on the waitlist who turns up and submits is moved to Approved. Off would leave them worse off than a stranger, who is approved instantly.",
  },
  {
    key: "createCrmLeadOnFeedbackRegistration",
    label: "Send self-registrations to the CRM",
    help: "Anyone who registers through the feedback link is also pushed to the Product Space CRM as a lead.",
  },
];

const DEFAULTS: EventSettings = {
  autoIssueCertificate: true,
  allowSelfRegistrationOnFeedback: true,
  promoteWaitlistedOnFeedback: true,
  createCrmLeadOnFeedbackRegistration: true,
};

export default function SettingsSection({
  eventId,
  initialSettings,
  onSaved,
}: {
  eventId: string;
  initialSettings?: Partial<EventSettings>;
  /**
   * Hand the saved settings back to whoever owns the event.
   *
   * Switching tabs unmounts this component, so on the way back it re-reads
   * `initialSettings` from the parent — which fetched the event once, before any
   * of these toggles moved. Without this the switch springs back to whatever it
   * was at page load, having genuinely saved.
   */
  onSaved?: (settings: EventSettings) => void;
}) {
  // Layered over the defaults exactly as the API does — an event saved before a
  // switch existed stores nothing for it, and reading that as `false` would show
  // a default-on setting as off.
  const [settings, setSettings] = useState<EventSettings>({
    ...DEFAULTS,
    ...(initialSettings || {}),
  });
  const [saving, setSaving] = useState<keyof EventSettings | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleToggle = async (key: keyof EventSettings, next: boolean) => {
    setSaving(key);
    // Optimistic — a switch that does not move when clicked feels broken.
    setSettings((current) => ({ ...current, [key]: next }));

    try {
      const saved = await eventFeedbackService.updateSettings(eventId, {
        [key]: next,
      });
      setSettings(saved);
      onSaved?.(saved);
      // Auto-issue changes what the banner should say, and the banner is the
      // only place the consequence is spelled out.
      setRefreshKey((n) => n + 1);
    } catch (error) {
      setSettings((current) => ({ ...current, [key]: !next }));
      toast.error(getApiErrorMessage(error, "Could not save the setting"));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-5">
      <ReadinessBanner eventId={eventId} refreshKey={refreshKey} />

      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {SWITCHES.map((item) => (
          <div
            key={item.key}
            className="flex items-start justify-between gap-6 p-4"
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{item.label}</span>
                {saving === item.key && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">{item.help}</p>
            </div>

            <Switch
              checked={settings[item.key]}
              onCheckedChange={(next) => handleToggle(item.key, next)}
              disabled={saving !== null}
              className="mt-0.5 shrink-0"
            />
          </div>
        ))}
      </div>

      {/* These only ever matter while the feedback window is open, and that
          switch lives with the link it controls rather than being duplicated
          here where the two could drift apart on screen. */}
      <p className="text-xs text-muted-foreground">
        All four apply only while <span className="font-medium">Accept responses</span>{" "}
        is on, which you can turn on or off on the Feedback tab.
      </p>
    </div>
  );
}
