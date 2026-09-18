"use client";

import { useMemo, useState } from "react";
import CertificateEditor from "@/gradient/components/Common/Certificate/CertificateEditor";
import { eventCertificateService } from "@/gradient/services/eventCertificateService";
import type { CertificateDomain, CertificateField } from "@/gradient/types/certificate";
import {
  CERTIFICATE_FIELD_KEYS,
  CERTIFICATE_FIELD_LABELS,
  CERTIFICATE_SAMPLE_VALUES,
} from "@/gradient/types/eventCertificate";
import CertificateEmailTab from "./CertificateEmailTab";
import CertificatesTable from "./CertificatesTable";
import ReadinessBanner from "../SettingsSection/ReadinessBanner";

type SubTab = "template" | "email" | "issued";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "template", label: "Design" },
  { key: "email", label: "Email" },
  { key: "issued", label: "Find a certificate" },
];

/**
 * Set up here, issue from the Feedback tab.
 *
 * The first two sub-tabs are the prerequisites — a certificate cannot be sent
 * without a design and an email. The third is a lookup: someone asks where
 * their certificate is, and this is where you find it. Generating happens
 * against the response that earned it, which is the only screen that knows who
 * was on it.
 */
/** Where a placeholder lands when first added, and what it looks like. */
const FIELD_DEFAULTS: Record<string, Omit<CertificateField, "key">> = {
  recipientName: { x: 50, y: 46, fontSize: 64, color: "#111111", fontFamily: "Playfair Display", fontWeight: 700, align: "center", maxWidth: 70 },
  eventTitle: { x: 50, y: 60, fontSize: 28, color: "#444444", fontFamily: "Inter", fontWeight: 500, align: "center", maxWidth: 80 },
  issuedDate: { x: 25, y: 86, fontSize: 20, color: "#666666", fontFamily: "Inter", fontWeight: 400, align: "center" },
  certificateNo: { x: 75, y: 86, fontSize: 16, color: "#999999", fontFamily: "Roboto Mono", fontWeight: 400, align: "center" },
};

export default function CertificateSection({
  eventId,
  eventTitle,
}: {
  eventId: string;
  /** Drawn on the design canvas — the preview substitutes the real title. */
  eventTitle: string;
}) {
  const [tab, setTab] = useState<SubTab>("template");

  // Everything the shared editor needs to know about events. The editor itself
  // has no idea what an event is — free courses hand it the same shape with
  // `courseTitle` in place of `eventTitle`.
  const domain = useMemo<CertificateDomain>(
    () => ({
      fieldKeys: CERTIFICATE_FIELD_KEYS,
      fieldLabels: CERTIFICATE_FIELD_LABELS,
      sampleValues: CERTIFICATE_SAMPLE_VALUES,
      fieldDefaults: FIELD_DEFAULTS,
      titleKey: "eventTitle",
      title: eventTitle,
      uploadFolder: "event",
      service: {
        getTemplate: eventCertificateService.getTemplate,
        saveTemplate: eventCertificateService.saveTemplate,
        preview: eventCertificateService.preview,
      },
    }),
    [eventTitle],
  );

  return (
    <div className="space-y-5">
      {/* Repeated from the Settings tab on purpose — this is where an admin
          is when the missing piece is one sub-tab away. */}
      <ReadinessBanner eventId={eventId} />

      <div className="flex gap-1 rounded-lg border border-border p-1">
        {SUB_TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === item.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "template" && (
        <CertificateEditor subjectId={eventId} domain={domain} />
      )}
      {tab === "email" && (
        <CertificateEmailTab eventId={eventId} eventTitle={eventTitle} />
      )}
      {tab === "issued" && <CertificatesTable eventId={eventId} />}
    </div>
  );
}
