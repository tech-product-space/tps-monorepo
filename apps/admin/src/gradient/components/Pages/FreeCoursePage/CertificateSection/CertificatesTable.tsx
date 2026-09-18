"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/gradient/components/ui/badge";
import { Input } from "@/gradient/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { freeCourseCertificateService } from "@/gradient/services/freeCourseCertificateService";
import { CERTIFICATE_STATUS_VARIANT } from "@/gradient/types/certificate";
import type { FreeCourseCertificateRow } from "@/gradient/types/freeCourseCertificate";

const formatDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

/**
 * A lookup, not a workflow.
 *
 * Somebody emails asking where their certificate is, or whether the one they
 * were sent is real — this is where you find it. Issuing happens on the
 * Learners tab, against the person who earned it.
 */
export default function CertificatesTable({ courseId }: { courseId: string }) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<FreeCourseCertificateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (term: string) => {
      setLoading(true);
      try {
        const data = await freeCourseCertificateService.listCertificates(
          courseId,
          term.trim() ? { search: term.trim() } : {},
        );
        setRows(data);
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Could not load certificates"));
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [courseId],
  );

  // Debounced so typing a certificate number does not fire a request a
  // keystroke.
  useEffect(() => {
    const timer = setTimeout(() => load(search), 300);
    return () => clearTimeout(timer);
  }, [search, load]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Certificate number, name or email"
          className="pl-8"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !rows.length ? (
        <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          {search.trim()
            ? "Nothing matches that."
            : "No certificates for this course yet."}
        </p>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Certificate</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Emailed</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-mono text-xs">{row.certificateNo}</p>
                    {row.issuedVia && (
                      <p className="text-[11px] text-muted-foreground">
                        via {row.issuedVia}
                      </p>
                    )}
                  </TableCell>

                  <TableCell>
                    <p className="text-sm font-medium">{row.recipientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.recipientEmail}
                    </p>
                  </TableCell>

                  <TableCell>
                    <Badge variant={CERTIFICATE_STATUS_VARIANT[row.status]}>
                      {row.status}
                    </Badge>
                    {row.lastError && (
                      <p className="mt-1 max-w-56 text-[11px] text-destructive">
                        {row.lastError}
                      </p>
                    )}
                    {row.revokeReason && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {row.revokeReason}
                      </p>
                    )}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(row.issuedAt)}
                  </TableCell>

                  {/* Separate from Issued on purpose: a PDF can exist while its
                      email never landed, and that is the case somebody is
                      usually writing in about. */}
                  <TableCell className="text-sm text-muted-foreground">
                    {row.emailSentAt ? (
                      formatDate(row.emailSentAt)
                    ) : row.status === "Issued" ? (
                      <span className="text-amber-600">never sent</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
