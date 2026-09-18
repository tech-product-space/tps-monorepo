"use client";

import { useMemo, useState } from "react";
import { Copy } from "lucide-react";

import { Button } from "@/gradient/components/ui/button";

import CertificateEditor from "@/gradient/components/Common/Certificate/CertificateEditor";
import { freeCourseCertificateService } from "@/gradient/services/freeCourseCertificateService";
import type { CertificateDomain } from "@/gradient/types/certificate";
import {
  FREE_COURSE_CERTIFICATE_FIELD_DEFAULTS,
  FREE_COURSE_CERTIFICATE_FIELD_KEYS,
  FREE_COURSE_CERTIFICATE_FIELD_LABELS,
  FREE_COURSE_CERTIFICATE_SAMPLE_VALUES,
} from "@/gradient/types/freeCourseCertificate";
import CertificateEmailTab from "./CertificateEmailTab";
import CopyFromCourseDialog from "./CopyFromCourseDialog";
import CertificatesTable from "./CertificatesTable";
import LearnersTab from "./LearnersTab";
import ReadinessBanner from "./ReadinessBanner";

type SubTab = "template" | "email" | "learners" | "issued";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "template", label: "Design" },
  { key: "email", label: "Email" },
  { key: "learners", label: "Learners" },
  { key: "issued", label: "Find a certificate" },
];

/**
 * Set up here, and issue here too.
 *
 * The first two sub-tabs are the prerequisites — a certificate cannot be issued
 * without a design and an email. **Learners** is the manual path: everyone who
 * has finished, and a Generate button for the ones auto-issue could not cover.
 * The last is a lookup, for when somebody asks where their certificate is.
 */
export default function CertificateSection({
  courseId,
  courseTitle,
}: {
  courseId: string;
  /** Drawn on the design canvas — the preview substitutes the real title. */
  courseTitle: string;
}) {
  const [tab, setTab] = useState<SubTab>("template");

  // Bumped whenever something changes what readiness would say, so the banner
  // stops claiming a design is missing the moment one is saved.
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((n) => n + 1);

  const [copyOpen, setCopyOpen] = useState(false);

  // Bumped after a copy and used as a `key` on the two editors, which load
  // their data once on mount. Remounting is the honest way to show what was
  // just written — an editor holding the old design in local state would
  // silently save it back over the copy.
  const [contentKey, setContentKey] = useState(0);

  const handleCopied = () => {
    setContentKey((n) => n + 1);
    refresh();
  };

  const domain = useMemo<CertificateDomain>(
    () => ({
      fieldKeys: FREE_COURSE_CERTIFICATE_FIELD_KEYS,
      fieldLabels: FREE_COURSE_CERTIFICATE_FIELD_LABELS,
      sampleValues: FREE_COURSE_CERTIFICATE_SAMPLE_VALUES,
      fieldDefaults: FREE_COURSE_CERTIFICATE_FIELD_DEFAULTS,
      titleKey: "courseTitle",
      title: courseTitle,
      uploadFolder: "free-course",
      service: {
        getTemplate: freeCourseCertificateService.getTemplate,
        saveTemplate: freeCourseCertificateService.saveTemplate,
        preview: freeCourseCertificateService.preview,
      },
    }),
    [courseTitle],
  );

  return (
    <div className="space-y-5">
      {/* The copy action lives up here rather than beside the tabs: it acts on
          the design *and* the email, so sitting inside a strip that switches
          between them read as though it belonged to whichever was open. */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Certificate</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The design, the email that delivers it, and who has one.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => setCopyOpen(true)}
        >
          <Copy className="h-4 w-4" />
          Copy from another course
        </Button>
      </div>

      {/* Repeated on the course Details tab too — this is where an admin is
          when the missing piece is one sub-tab away. */}
      <ReadinessBanner courseId={courseId} refreshKey={refreshKey} />

      <CopyFromCourseDialog
        courseId={courseId}
        open={copyOpen}
        onOpenChange={setCopyOpen}
        onCopied={handleCopied}
      />

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
        <CertificateEditor
          key={contentKey}
          subjectId={courseId}
          domain={domain}
        />
      )}
      {tab === "email" && (
        <CertificateEmailTab
          key={contentKey}
          courseId={courseId}
          onSaved={refresh}
        />
      )}
      {tab === "learners" && (
        <LearnersTab courseId={courseId} onChanged={refresh} />
      )}
      {tab === "issued" && <CertificatesTable courseId={courseId} />}
    </div>
  );
}
