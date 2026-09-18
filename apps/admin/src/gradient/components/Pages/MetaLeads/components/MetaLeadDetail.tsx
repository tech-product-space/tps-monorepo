"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, ExternalLink, Loader2 } from "lucide-react";

import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Label } from "@/gradient/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import { metaService } from "@/gradient/services/metaService";
import {
  META_LEAD_EDITABLE_STATUSES,
  META_LEAD_STATUS_LABELS,
  type MetaLead,
  type MetaLeadDetail as MetaLeadDetailType,
  type MetaLeadStatus,
} from "@/gradient/types/meta";

interface Props {
  lead: MetaLead | null;
  open: boolean;
  onClose: () => void;
  onStatusChanged: (id: string, status: MetaLeadStatus) => void;
}

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-muted-foreground">
      {label}
    </div>
    <div className="mt-0.5 text-sm">{value ?? "—"}</div>
  </div>
);

/** Turns `which_programme` into `Which programme`. */
const humanise = (key: string) =>
  key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const MetaLeadDetail = ({ lead, open, onClose, onStatusChanged }: Props) => {
  const [detail, setDetail] = useState<MetaLeadDetailType | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!open || !lead) return;

    // The list omits rawPayload, so the detail is always a fresh fetch.
    setDetail(null);
    setShowRaw(false);
    setLoading(true);

    metaService
      .getLead(lead.id)
      .then((res) => setDetail(res.data))
      .catch(() => toast.error("Could not load this lead"))
      .finally(() => setLoading(false));
  }, [open, lead]);

  const handleStatus = async (status: MetaLeadStatus) => {
    if (!lead) return;

    setSaving(true);

    try {
      await metaService.updateLeadStatus(lead.id, status);
      setDetail((prev) => (prev ? { ...prev, status } : prev));
      onStatusChanged(lead.id, status);
      toast.success("Status updated");
    } catch {
      toast.error("Could not update the status");
    } finally {
      setSaving(false);
    }
  };

  const answers = Object.entries(detail?.fields || {});

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/* See AccountDialog: the grid children need min-w-0 or the raw-payload
          <pre> widens the dialog instead of scrolling inside it. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto text-sm sm:max-w-3xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>
            {detail?.name || lead?.name || "Facebook lead"}
          </DialogTitle>
          <DialogDescription>
            {detail?.formName || lead?.formName || "Lead ad form"}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {detail && (
          <div className="space-y-6">
            {/* Status — the one editable field. Everything else on this row is
                Facebook's record of what somebody typed. */}
            <div className="flex items-end justify-between gap-4">
              <div className="w-48">
                <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                  Status
                </Label>
                <Select
                  value={detail.status}
                  onValueChange={(value) => handleStatus(value as MetaLeadStatus)}
                  disabled={saving || detail.status === "skipped"}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {META_LEAD_EDITABLE_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {META_LEAD_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                    {detail.status === "skipped" && (
                      <SelectItem value="skipped" disabled>
                        Skipped
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {detail.status === "skipped" && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    This lead arrived with no email and no phone number, so
                    there is no one to move it along to.
                  </p>
                )}
              </div>

              {detail.importedVia === "backfill" && (
                <Badge variant="outline" className="font-normal">
                  Imported by backfill
                </Badge>
              )}
            </div>

            {/* The cross-channel answer. Resolved at read time only — the two
                pipelines never touch at write time, by design. */}
            {detail.websiteLead && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="text-sm font-medium text-amber-900">
                  This email is also in Website Leads
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <span className="text-sm text-amber-800">
                    {detail.websiteLead.source} ·{" "}
                    {new Date(detail.websiteLead.createdAt).toLocaleDateString()}
                  </span>
                  <Link
                    href={`/leads?search=${encodeURIComponent(detail.websiteLead.email)}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-amber-900 underline"
                  >
                    View
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field label="Email" value={detail.email} />
              <Field
                label="Phone"
                value={
                  detail.phone
                    ? `${detail.countryCode ? `${detail.countryCode} ` : ""}${detail.phone}`
                    : null
                }
              />
              <Field label="Source" value={detail.sourceDisplayName || detail.source} />
              <Field
                label="Sub source"
                value={detail.subSourceDisplayName || detail.subSource}
              />
            </div>

            <div>
              <h4 className="mb-2 text-sm font-medium">Ad</h4>
              <div className="grid grid-cols-2 gap-4 rounded-lg border p-3">
                <Field label="Campaign" value={detail.campaignName} />
                <Field label="Ad set" value={detail.adsetName} />
                <Field label="Ad" value={detail.adName} />
                <Field label="Page" value={detail.account?.name} />
              </div>
            </div>

            {/* The interesting question on a real lead form is usually the
                fourth one, which is exactly why these are kept. */}
            {answers.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium">Form answers</h4>
                <dl className="divide-y rounded-lg border">
                  {answers.map(([key, value]) => (
                    <div key={key} className="grid grid-cols-3 gap-3 p-3">
                      <dt className="text-sm text-muted-foreground">
                        {humanise(key)}
                      </dt>
                      <dd className="col-span-2 text-sm">
                        {Array.isArray(value) ? value.join(", ") : value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            <div>
              <button
                type="button"
                onClick={() => setShowRaw((prev) => !prev)}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                {showRaw ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                View raw Facebook payload
              </button>

              {showRaw && (
                <pre className="mt-2 max-h-64 max-w-full overflow-auto rounded-lg bg-muted p-3 text-xs">
                  {JSON.stringify(detail.rawPayload, null, 2)}
                </pre>
              )}
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default MetaLeadDetail;
