"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import EmailEditor from "@/gradient/components/ui/EmailEditor/EmailEditor";
import EmailTemplateToolbar from "@/gradient/components/Common/EmailTemplateToolbar/EmailTemplateToolbar";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { eventService } from "@/gradient/services/eventService";

const TYPE = "Certificate";

const PLACEHOLDERS = [
  ["{{name}}", "the recipient's name"],
  ["{{eventTitle}}", "the event title"],
  ["{{certificateNo}}", "e.g. GRD-2026-7K4M9QX2"],
];

/**
 * Reuses the existing EventEmailTemplates table with type "Certificate" rather
 * than introducing a second email-template model — the certificate template
 * holds the design, this holds the covering email.
 */
export default function CertificateEmailTab({
  eventId,
  eventTitle,
}: {
  eventId: string;
  eventTitle: string;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    eventService
      .getTemplate(eventId, TYPE)
      .then((res) => {
        setSubject(res.data?.subject || "");
        setBody(res.data?.body || "");
      })
      .catch(() => {
        // No template yet is the normal starting state.
      })
      .finally(() => setLoading(false));
  }, [eventId]);

  const handleSave = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Both a subject and a body are required");
      return;
    }

    setSaving(true);
    try {
      await eventService.upsertTemplate(eventId, { type: TYPE, subject, body });
      toast.success("Certificate email saved");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not save the email"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Without this template a certificate still renders and stores, but
          nothing is emailed — the row sits Issued with emailSentAt null. */}
      <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Certificates are not sent until this email exists. There is no
        certificate link to paste — the file is private and downloaded from the
        recipient&apos;s dashboard on the website, so write the email to tell
        them to sign in there. Recipients without an account use the same email
        address to sign up, and the certificate is waiting for them.
      </div>

      <EmailTemplateToolbar
        eventId={eventId}
        type={TYPE}
        eventTitle={eventTitle}
        subject={subject}
        body={body}
        onPaste={({ subject: nextSubject, body: nextBody }) => {
          setSubject(nextSubject);
          setBody(nextBody);
        }}
      />

      <div className="space-y-1.5">
        <Label htmlFor="certificate-subject">Subject</Label>
        <Input
          id="certificate-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Your certificate for {{eventTitle}}"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Body</Label>
        <EmailEditor value={body} onChange={setBody} />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {PLACEHOLDERS.map(([token, meaning]) => (
          <span key={token}>
            <code className="rounded bg-muted px-1 py-0.5">{token}</code> {meaning}
          </span>
        ))}
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Save email
      </Button>
    </div>
  );
}
