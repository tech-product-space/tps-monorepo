"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent } from "@/gradient/components/ui/card";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import Pagination from "@/gradient/components/ui/custom/Pagination";

import { campaignService } from "@/gradient/services/campaignService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { useAuth } from "@/gradient/context/AuthContext";
import { SOURCE_LABELS, type CampaignPreview } from "@/gradient/types/campaign";
import type { IPaginationMeta } from "@/gradient/types/pagination";

const EMPTY_META: IPaginationMeta = {
  total: 0,
  page: 1,
  limit: 10,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

/**
 * Who this is about to go to, and a test send.
 *
 * A page rather than a dialog: this is the screen somebody reads carefully
 * before mailing several thousand people, and it wants a URL you can send to a
 * colleague, a back button, and room to scroll without a modal fighting it.
 *
 * The counts are the point. Resource downloads have no dedupe at capture, and
 * one person can appear in several sources, so **records matched is not
 * people** — both are shown rather than the flattering one.
 */
export default function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { admin } = useAuth();

  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [meta, setMeta] = useState<IPaginationMeta>(EMPTY_META);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [testTo, setTestTo] = useState("");
  const [testName, setTestName] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await campaignService.preview(id, { page, limit });
      setPreview(res.data);
      if (res.meta) setMeta(res.meta);
    } catch (err) {
      // A bad audience source is a 400 naming the offending source, not a
      // server fault — show it rather than a generic failure.
      setError(getApiErrorMessage(err, "Failed to resolve the audience"));
    } finally {
      setLoading(false);
    }
  }, [id, page, limit]);

  useEffect(() => {
    load();
  }, [load]);

  // Prefill the admin's own address once, when it first arrives. Keyed off a
  // ref rather than off `testTo` being empty: an emptiness check re-fires the
  // moment the field is cleared, so clearing it to type a colleague's address
  // would just snap your own back in.
  const testToPrefilled = useRef(false);
  useEffect(() => {
    if (testToPrefilled.current || !admin?.email) return;
    testToPrefilled.current = true;
    setTestTo(admin.email);
  }, [admin?.email]);

  const handleTest = async () => {
    if (!testTo) return;

    setSendingTest(true);
    try {
      await campaignService.sendTest(id, {
        to: testTo,
        name: testName || undefined,
      });
      toast.success(`Test email sent to ${testTo}`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to send the test email"));
    } finally {
      setSendingTest(false);
    }
  };

  const totals = preview?.totals;

  return (
    <DashboardLayout
      title={
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/marketing/campaigns/${id}`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="truncate">
            Preview{preview?.campaign?.name ? ` · ${preview.campaign.name}` : ""}
          </span>
        </>
      }
    >
      <div className="mx-auto max-w-5xl space-y-5">
        {loading && !preview ? (
          <div className="flex justify-center py-24">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-md border p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <>
            {/* Headline */}
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-4xl font-semibold">
                  {totals?.mailable.toLocaleString() ?? 0}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  people will receive this
                </p>
                <p className="text-muted-foreground mt-3 text-xs">
                  Resolved now. The audience is resolved again when the campaign
                  actually sends, so late signups are included.
                </p>
              </CardContent>
            </Card>

            {/* The arithmetic, so the headline is checkable */}
            <div
              className={`grid grid-cols-2 gap-3 ${
                totals?.unemailable ? "sm:grid-cols-5" : "sm:grid-cols-4"
              }`}
            >
              {[
                { label: "Records matched", value: totals?.rowsMatched },
                { label: "Unique people", value: totals?.uniquePeople },
                { label: "Excluded", value: totals?.excluded },
                { label: "Unsubscribed", value: totals?.suppressed },
                // Only Facebook produces these, and only sometimes. Hidden at
                // zero rather than shown as a permanent "0 — no email", which
                // would read as a warning on every other campaign.
                ...(totals?.unemailable
                  ? [{ label: "No email", value: totals.unemailable }]
                  : []),
              ].map((tile) => (
                <div key={tile.label} className="rounded-md border bg-white p-3">
                  <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                    {tile.label}
                  </p>
                  <p className="mt-1 text-xl font-semibold">
                    {(tile.value ?? 0).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            {totals && totals.rowsMatched !== totals.uniquePeople && (
              <p className="text-muted-foreground text-xs">
                {totals.rowsMatched.toLocaleString()} records resolve to{" "}
                {totals.uniquePeople.toLocaleString()} people — the same person
                can appear in more than one source, or have downloaded more than
                one resource.
              </p>
            )}

            {/* The gap this explains is enormous on paid social — a form that
                asks for a phone number and nothing else contributes nobody. */}
            {totals?.unemailable ? (
              <p className="text-muted-foreground text-xs">
                {totals.unemailable.toLocaleString()} Facebook{" "}
                {totals.unemailable === 1 ? "lead" : "leads"} matched but gave
                only a phone number, so {totals.unemailable === 1 ? "it" : "they"}{" "}
                cannot be emailed and {totals.unemailable === 1 ? "is" : "are"}{" "}
                not counted above.
              </p>
            ) : null}

            {/* Per-source breakdown */}
            {preview && (
              <Card>
                <CardContent className="space-y-1 p-4">
                  <p className="mb-2 text-xs font-semibold">Sources</p>

                  {preview.breakdown.include.map((s) => (
                    <div
                      key={s.type}
                      className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                    >
                      <span>{SOURCE_LABELS[s.type] || s.type}</span>
                      <span className="text-muted-foreground text-xs">
                        {s.rows.toLocaleString()} records ·{" "}
                        <b className="text-foreground">
                          {s.unique.toLocaleString()}
                        </b>{" "}
                        people added
                      </span>
                    </div>
                  ))}

                  {!preview.breakdown.include.length && (
                    <p className="text-muted-foreground text-sm">
                      No sources selected — nobody will receive this.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* A page of actual people */}
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(preview?.recipients ?? []).map((r) => (
                        <TableRow key={r.email}>
                          <TableCell>{r.name || "—"}</TableCell>
                          <TableCell>{r.email}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {SOURCE_LABELS[r.sourceType] || r.sourceType}
                          </TableCell>
                        </TableRow>
                      ))}
                      {!preview?.recipients?.length && (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="text-muted-foreground py-8 text-center"
                          >
                            Nobody matches this audience.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <Pagination
                  meta={meta}
                  onPageChange={setPage}
                  onLimitChange={setLimit}
                />
              </CardContent>
            </Card>

            {/* Test send — the same compose path as a real send */}
            <Card>
              <CardContent className="space-y-3 p-4">
                <p className="text-sm font-semibold">Send a test</p>
                <p className="text-muted-foreground text-xs">
                  Goes through the same path as the real send, so the
                  unsubscribe footer and link tracking are exactly what
                  recipients get.
                </p>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-60 flex-1 space-y-1.5">
                    <Label className="text-xs">Send to</Label>
                    <Input
                      value={testTo}
                      onChange={(e) => setTestTo(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="min-w-40 flex-1 space-y-1.5">
                    <Label className="text-xs">Name for {"{{name}}"}</Label>
                    <Input
                      value={testName}
                      onChange={(e) => setTestName(e.target.value)}
                      placeholder="there"
                    />
                  </div>
                  <Button onClick={handleTest} disabled={sendingTest || !testTo}>
                    {sendingTest ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Send test
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
