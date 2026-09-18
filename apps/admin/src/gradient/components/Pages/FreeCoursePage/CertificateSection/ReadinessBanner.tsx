"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, PauseCircle } from "lucide-react";

import { freeCourseCertificateService } from "@/gradient/services/freeCourseCertificateService";
import type { FreeCourseCertificateReadiness } from "@/gradient/types/freeCourseCertificate";

const REASONS: Record<string, string> = {
  template: "no certificate design",
  email: "no certificate email",
  emailDisabled: "the certificate email is switched off",
  lessons: "no published lessons",
};

/**
 * "If someone finishes the last lesson right now, does a certificate go out?"
 *
 * Worth answering before anyone finishes rather than after. Auto-issue on with
 * a missing email is the one combination that fails silently — the learner
 * completes the course, nothing is created, and the first anyone hears of it is
 * a support message weeks later.
 */
export default function ReadinessBanner({
  courseId,
  refreshKey,
}: {
  courseId: string;
  /** Bump to re-check after saving a design or an email. */
  refreshKey?: number;
}) {
  const [readiness, setReadiness] =
    useState<FreeCourseCertificateReadiness | null>(null);

  useEffect(() => {
    let cancelled = false;

    freeCourseCertificateService
      .readiness(courseId)
      .then((data) => {
        if (!cancelled) setReadiness(data);
      })
      .catch(() => {
        if (!cancelled) setReadiness(null);
      });

    return () => {
      cancelled = true;
    };
  }, [courseId, refreshKey]);

  if (!readiness) return null;

  if (!readiness.ready) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
        <p className="flex items-center gap-2 text-sm font-medium text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          Certificates are not going out yet
        </p>
        <p className="mt-1 pl-6 text-xs text-amber-700">
          {readiness.missing.map((key) => REASONS[key] || key).join(", ")}.
          Until this is fixed, finishing the course creates nothing at all —
          deliberately, so nobody ends up with a certificate that was never sent.
        </p>
      </div>
    );
  }

  // Ready, but the switch is off. Not a problem — an admin may well intend to
  // generate by hand — so it reads as information, not a warning.
  if (!readiness.autoIssueCertificate) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <PauseCircle className="h-4 w-4" />
          Set up, but automatic issuing is off
        </p>
        <p className="mt-1 pl-6 text-xs text-muted-foreground">
          Finishing the course will not issue anything. Use Generate on the
          Learners tab.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4" />
        Certificates go out automatically when someone finishes
      </p>
      <p className="mt-1 pl-6 text-xs text-emerald-800">
        {readiness.publishedLessons} published lesson
        {readiness.publishedLessons === 1 ? "" : "s"}
        {readiness.issuedCertificates > 0 && (
          <>
            {" · "}
            {readiness.issuedCertificates} certificate
            {readiness.issuedCertificates === 1 ? "" : "s"} issued so far
          </>
        )}
      </p>
    </div>
  );
}
