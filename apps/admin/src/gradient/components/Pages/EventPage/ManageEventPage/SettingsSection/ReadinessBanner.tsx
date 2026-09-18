"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, PauseCircle } from "lucide-react";

import { eventCertificateService } from "@/gradient/services/eventCertificateService";
import { CertificateReadiness } from "@/gradient/types/eventCertificate";

/**
 * "If someone submits feedback right now, does a certificate actually go out?"
 *
 * Deliberately self-contained — it fetches its own state so it can sit on both
 * the Settings and Certificate tabs without either having to care. The
 * duplication is the point: the failure it warns about is silent, and the
 * settings themselves live on a tab nobody visits until something has already
 * gone wrong.
 *
 * `refreshKey` lets the Settings tab re-ask after a toggle moves.
 */
export default function ReadinessBanner({
  eventId,
  refreshKey = 0,
}: {
  eventId: string;
  refreshKey?: number;
}) {
  const [readiness, setReadiness] = useState<CertificateReadiness | null>(null);

  useEffect(() => {
    let cancelled = false;

    eventCertificateService
      .readiness(eventId)
      .then((data) => {
        if (!cancelled) setReadiness(data);
      })
      .catch(() => {
        // A banner that cannot load is not worth an error toast on top of
        // whatever else the page is already reporting.
      });

    return () => {
      cancelled = true;
    };
  }, [eventId, refreshKey]);

  if (!readiness) return null;

  // Off is a decision, not a problem — say so once, quietly, and stop.
  if (!readiness.autoIssueCertificate) {
    return (
      <Banner
        tone="muted"
        icon={<PauseCircle className="h-4 w-4" />}
        title="Automatic certificates are off"
        body="Submitting feedback will not send anything. Generate them from the Feedback tab when you are ready."
      />
    );
  }

  if (readiness.willAutoIssue) {
    return (
      <Banner
        tone="ok"
        icon={<CheckCircle2 className="h-4 w-4" />}
        title="Certificates go out automatically"
        body="Each submission issues certificates to the person who submitted and every teammate they name — immediately, with no approval step."
      />
    );
  }

  const missing = readiness.missing
    .map((item) => (item === "template" ? "a certificate design" : "a certificate email"))
    .join(" and ");

  return (
    <Banner
      tone="warn"
      icon={<AlertTriangle className="h-4 w-4" />}
      title={`Automatic certificates are on, but nothing will be sent — there is no ${missing}`}
      // The consequence, not just the fact. Nothing is created in this state:
      // the submission is saved and the certificates simply do not exist, so
      // there is no queue quietly filling up that will flush once it is fixed.
      body="Submissions are still recorded, but no certificate is created for them. Add the missing piece here on the Certificate tab, then generate the backlog from the Feedback tab."
    />
  );
}

const TONES = {
  ok: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  muted: "border-border bg-muted/40 text-muted-foreground",
} as const;

const Banner = ({
  tone,
  icon,
  title,
  body,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  title: string;
  body: string;
}) => (
  <div className={`flex gap-3 rounded-lg border p-3 ${TONES[tone]}`}>
    <span className="mt-0.5 shrink-0">{icon}</span>
    <div className="space-y-0.5">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs opacity-90">{body}</p>
    </div>
  </div>
);
