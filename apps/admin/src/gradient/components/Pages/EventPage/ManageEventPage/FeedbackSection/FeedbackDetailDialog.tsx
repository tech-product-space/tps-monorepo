"use client";

import {
  AlertTriangle,
  Award,
  ExternalLink,
  Mail,
  MailWarning,
  Phone,
  Star,
  User,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Badge } from "@/gradient/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/gradient/components/ui/tooltip";
import {
  EventFeedback,
  FeedbackField,
  FeedbackForm,
  FeedbackRecipient,
  FeedbackTeammate,
} from "@/gradient/types/eventFeedback";
import { CERTIFICATE_STATUS_VARIANT } from "@/gradient/types/eventCertificate";

interface FeedbackDetailDialogProps {
  feedback: EventFeedback | null;
  form: FeedbackForm | null;
  onClose: () => void;
}

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const Section = ({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="rounded-lg border border-border p-4 space-y-4">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {aside}
    </div>
    {children}
  </section>
);

/**
 * A rating as a bar of pips rather than a number.
 *
 * `max` comes from the field, not a constant — the definition already says what
 * the scale is, and a hardcoded 10 would quietly misread a 1–5 question.
 */
const Rating = ({ value, max }: { value: number; max: number }) => (
  <div className="flex flex-wrap items-center gap-1">
    {Array.from({ length: max }).map((_, index) => (
      <Star
        key={index}
        className={`h-3.5 w-3.5 ${
          index < value
            ? "fill-amber-400 text-amber-400"
            : "text-muted-foreground/30"
        }`}
      />
    ))}
    <span className="ml-2 text-sm font-semibold">
      {value}/{max}
    </span>
  </div>
);

/**
 * Answers are rendered by the field's declared type, not guessed from the
 * value. That is the payoff for the form living in one definition both ends
 * read: a URL becomes something an admin can click through to review, a long
 * answer gets room to breathe, and an unanswered optional question still shows
 * as unanswered rather than vanishing.
 */
const Answer = ({ field, value }: { field: FeedbackField; value: unknown }) => {
  if (value === undefined || value === null || value === "") {
    return <p className="text-sm text-muted-foreground">Not answered</p>;
  }

  switch (field.type) {
    case "rating": {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? (
        <Rating value={numeric} max={field.max ?? 10} />
      ) : (
        <p className="text-sm">{String(value)}</p>
      );
    }

    case "url":
      return (
        <a
          href={String(value)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 break-all text-sm text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          {String(value)}
        </a>
      );

    case "multiSelect":
      return (
        <div className="flex flex-wrap gap-1.5">
          {(Array.isArray(value) ? value : [value]).map((item) => (
            <Badge key={String(item)} variant="secondary">
              {String(item)}
            </Badge>
          ))}
        </div>
      );

    case "select":
      return <Badge variant="secondary">{String(value)}</Badge>;

    case "longText":
      return (
        <div className="rounded-md border border-border bg-muted/40 p-3">
          <p className="whitespace-pre-wrap text-sm">{String(value)}</p>
        </div>
      );

    default:
      return <p className="break-words text-sm">{String(value)}</p>;
  }
};

/** One teammate, with whatever certificate they have. */
const TeammateCard = ({
  teammate,
  recipient,
}: {
  teammate: FeedbackTeammate;
  recipient?: FeedbackRecipient;
}) => {
  const certificate = recipient?.certificate;
  const emailStuck = certificate?.status === "Issued" && !certificate.emailSentAt;

  return (
    <div className="rounded-md border border-border p-3 space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{teammate.name}</span>
          {teammate.wasCorrected && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <AlertTriangle className="h-3 w-3" />
              corrected
            </Badge>
          )}
        </div>

        {certificate ? (
          <div className="flex items-center gap-2">
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
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No certificate</span>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Mail className="h-3 w-3" />
        {teammate.email}
      </p>

      {teammate.phone && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Phone className="h-3 w-3" />
          {teammate.countryCode ? `${teammate.countryCode} ` : ""}
          {teammate.phone}
        </p>
      )}

      {/* The raw submission is never rewritten, so an admin can always see what
          was originally typed. */}
      {teammate.wasCorrected && teammate.originalEmail && (
        <p className="text-[11px] text-muted-foreground">
          originally submitted as {teammate.originalEmail}
        </p>
      )}
    </div>
  );
};

export default function FeedbackDetailDialog({
  feedback,
  form,
  onClose,
}: FeedbackDetailDialogProps) {
  if (!feedback) return null;

  const guest = feedback.guest;
  const summary = feedback.certificateSummary;

  // Driven by the form definition rather than by the keys present in the data,
  // so a question nobody answered still shows as unanswered instead of vanishing.
  const scalarFields = (form?.fields || []).filter((f) => f.type !== "group");

  const recipientByEmail = new Map(
    (feedback.recipients || []).map((r) => [r.email, r]),
  );

  const submitter = guest?.email
    ? recipientByEmail.get(guest.email.toLowerCase())
    : undefined;

  const submitterCertificate = submitter?.certificate;
  const viaFeedback = guest?.additionalData?.registeredVia === "feedback";

  return (
    <Dialog open={!!feedback} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{guest?.name || "Response"}</DialogTitle>
          <DialogDescription>
            {guest?.email}
            {guest?.phone ? ` · ${guest.phone}` : ""}
            {` · submitted ${formatDateTime(feedback.submittedAt)}`}
          </DialogDescription>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {guest?.attendeeType && (
              <Badge variant="outline" className="text-[10px]">
                {guest.attendeeType}
              </Badge>
            )}
            {guest?.status && (
              <Badge variant="outline" className="text-[10px]">
                {guest.status}
              </Badge>
            )}
            {viaFeedback && (
              <Badge variant="outline" className="text-[10px]">
                registered via feedback
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <Section
            title="Response"
            aside={
              form?.title ? (
                <span className="text-xs text-muted-foreground">
                  {form.title}
                </span>
              ) : undefined
            }
          >
            <div className="space-y-4">
              {scalarFields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    {field.label}
                  </p>
                  <Answer field={field} value={feedback.responses?.[field.key]} />
                </div>
              ))}
            </div>
          </Section>

          {feedback.teammates.length > 0 && (
            <Section title={`Team (${feedback.teammates.length})`}>
              <div className="space-y-2">
                {feedback.teammates.map((teammate) => (
                  <TeammateCard
                    key={teammate.email}
                    teammate={teammate}
                    recipient={recipientByEmail.get(teammate.email)}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* Last, because it is the consequence of the response rather than
              part of it — but on the same screen, since "did their certificate
              go out?" is the question an admin opens a response to answer. */}
          <Section
            title="Certificates"
            aside={
              <span className="text-xs text-muted-foreground">
                {summary.issued} of {summary.total} issued
              </span>
            }
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Award className="h-4 w-4 text-muted-foreground" />
                {submitterCertificate ? (
                  <>
                    <span className="text-sm">This submitter:</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {submitterCertificate.certificateNo}
                    </span>
                    <Badge
                      variant={
                        CERTIFICATE_STATUS_VARIANT[submitterCertificate.status]
                      }
                    >
                      {submitterCertificate.status}
                    </Badge>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    No certificate for the submitter yet.
                  </span>
                )}
              </div>

              {summary.none > 0 && (
                <p className="text-xs text-muted-foreground">
                  {summary.none} of {summary.total} on this response have no
                  certificate. Generate from the table behind this dialog.
                </p>
              )}

              {summary.failed > 0 && (
                <p className="text-xs text-destructive">
                  {summary.failed} failed to render. Retry from the Certificates
                  tab, where the error is shown.
                </p>
              )}
            </div>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
