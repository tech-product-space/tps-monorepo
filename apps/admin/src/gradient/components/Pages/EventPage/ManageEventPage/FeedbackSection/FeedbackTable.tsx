"use client";

import { Fragment } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  MailWarning,
  Send,
  Users,
} from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/gradient/components/ui/tooltip";
import {
  EventFeedback,
  FeedbackCertificateSummary,
  FeedbackRecipient,
  FeedbackTeammate,
} from "@/gradient/types/eventFeedback";
import { CERTIFICATE_STATUS_VARIANT } from "@/gradient/types/eventCertificate";

interface FeedbackTableProps {
  feedbacks: EventFeedback[];
  loading: boolean;
  /** Ids the admin has ticked, for the bulk generate above the table. */
  selectedIds: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  onSelect: (feedback: EventFeedback) => void;
  onGenerate: (feedback: EventFeedback) => void;
  generatingId: string | null;
  /** False while the event has no certificate design — generating would fail. */
  canGenerate: boolean;
  /**
   * Whether this event type collects teammates at all. A Workshop does not, so
   * the Team column would be a chevron over a 1 for every row.
   */
  hasTeams: boolean;
}

const formatDate = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Everything that has not landed yet, and everything that landed badly. */
const isActionable = (summary: FeedbackCertificateSummary) =>
  summary.none > 0 || summary.failed > 0 || summary.pending > 0;

/**
 * One chip for the whole response.
 *
 * A count is more useful than a status here: a four-person team where three
 * certificates went out and one failed is a different problem from one where
 * nothing has been generated at all, and both are "not done".
 */
const CertificateChip = ({ summary }: { summary: FeedbackCertificateSummary }) => {
  if (!summary.total) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  if (summary.failed) {
    return (
      <Badge variant="destructive">
        {summary.failed} failed
      </Badge>
    );
  }

  if (summary.issued === summary.total) {
    return <Badge>Issued</Badge>;
  }

  if (summary.none === summary.total) {
    return <Badge variant="outline">Not generated</Badge>;
  }

  if (summary.inProgress || summary.pending) {
    return (
      <Badge variant="secondary">
        {summary.issued}/{summary.total} issued
      </Badge>
    );
  }

  return (
    <Badge variant="outline">
      {summary.issued}/{summary.total} issued
    </Badge>
  );
};

/** The expanded panel: who is on this response, and where each one stands. */
const RecipientRow = ({
  recipient,
  teammate,
}: {
  recipient: FeedbackRecipient;
  teammate?: FeedbackTeammate;
}) => {
  const certificate = recipient.certificate;
  const emailStuck = certificate?.status === "Issued" && !certificate.emailSentAt;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{recipient.name}</span>

          <Badge variant="outline" className="text-[10px]">
            {recipient.source === "Attendee" ? "submitted" : "teammate"}
          </Badge>

          {teammate?.wasCorrected && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <AlertTriangle className="h-3 w-3" />
              corrected
            </Badge>
          )}
        </div>

        <p className="truncate text-xs text-muted-foreground">
          {recipient.email}
          {teammate?.phone
            ? ` · ${teammate.countryCode ? `${teammate.countryCode} ` : ""}${teammate.phone}`
            : ""}
        </p>

        {/* The raw submission is never rewritten, so an admin can always see
            what was originally typed. */}
        {teammate?.wasCorrected && teammate.originalEmail && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            originally submitted as {teammate.originalEmail}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {certificate ? (
          <>
            <span className="font-mono text-[11px] text-muted-foreground">
              {certificate.certificateNo}
            </span>
            <Badge variant={CERTIFICATE_STATUS_VARIANT[certificate.status]}>
              {certificate.status}
            </Badge>
            {emailStuck && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <MailWarning className="h-3.5 w-3.5 text-amber-500" />
                </TooltipTrigger>
                <TooltipContent>
                  Certificate exists but the email never sent
                </TooltipContent>
              </Tooltip>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">No certificate</span>
        )}
      </div>
    </div>
  );
};

export default function FeedbackTable({
  feedbacks,
  loading,
  selectedIds,
  onToggle,
  onToggleAll,
  expandedId,
  onExpand,
  onSelect,
  onGenerate,
  generatingId,
  canGenerate,
  hasTeams,
}: FeedbackTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!feedbacks.length) {
    return (
      <div className="rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-sm font-medium">No responses</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Share the feedback link above, or clear the search.
        </p>
      </div>
    );
  }

  const allSelected = feedbacks.every((f) => selectedIds.includes(f.id));
  const columnCount = hasTeams ? 7 : 6;

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                aria-label="Select every response on this page"
                className="h-3.5 w-3.5 cursor-pointer accent-primary"
                checked={allSelected}
                onChange={onToggleAll}
              />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            {hasTeams && <TableHead>Team</TableHead>}
            <TableHead>Certificates</TableHead>
            <TableHead>Submitted</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {feedbacks.map((feedback) => {
            const guest = feedback.guest;
            const viaFeedback =
              guest?.additionalData?.registeredVia === "feedback";
            const expanded = expandedId === feedback.id;
            const summary = feedback.certificateSummary;
            const teammateByEmail = new Map(
              feedback.teammates.map((t) => [t.email, t]),
            );

            return (
              <Fragment key={feedback.id}>
                <TableRow
                  onClick={() => onSelect(feedback)}
                  className="cursor-pointer"
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${guest?.name || "response"}`}
                      className="h-3.5 w-3.5 cursor-pointer accent-primary"
                      checked={selectedIds.includes(feedback.id)}
                      onChange={() => onToggle(feedback.id)}
                    />
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{guest?.name || "—"}</span>
                      {/* Post-hoc registrations should be visible, not silently
                          indistinguishable from people who signed up beforehand. */}
                      {viaFeedback && (
                        <Badge variant="outline" className="text-[10px]">
                          via feedback
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    {guest?.email || "—"}
                  </TableCell>

                  {hasTeams && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {/* The dropdown, not the detail dialog: an admin checking
                          who is on a team should not have to leave the table. */}
                      <button
                        type="button"
                        onClick={() => onExpand(expanded ? null : feedback.id)}
                        className="flex items-center gap-1 text-sm hover:text-foreground"
                      >
                        {expanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        {summary.total || 1}
                      </button>
                    </TableCell>
                  )}

                  <TableCell>
                    <CertificateChip summary={summary} />
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    {formatDate(feedback.submittedAt)}
                  </TableCell>

                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isActionable(summary) ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                !canGenerate || generatingId === feedback.id
                              }
                              onClick={() => onGenerate(feedback)}
                            >
                              {generatingId === feedback.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              {summary.failed ? "Retry" : "Generate"}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {canGenerate
                            ? "Approve and send certificates to everyone on this response"
                            : "Design the certificate first"}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Done
                      </span>
                    )}
                  </TableCell>
                </TableRow>

                {expanded && hasTeams && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={columnCount} className="bg-muted/40 p-3">
                      <div className="space-y-2">
                        {feedback.recipients.length ? (
                          feedback.recipients.map((recipient) => (
                            <RecipientRow
                              key={recipient.email}
                              recipient={recipient}
                              teammate={teammateByEmail.get(recipient.email)}
                            />
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Nobody on this response can be sent a certificate —
                            there is no email address on it.
                          </p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
