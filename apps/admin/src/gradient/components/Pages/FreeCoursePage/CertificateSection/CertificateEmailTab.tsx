"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Switch } from "@/gradient/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import EmailEditor from "@/gradient/components/ui/EmailEditor/EmailEditor";
import { useAuth } from "@/gradient/context/AuthContext";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { freeCourseCertificateService } from "@/gradient/services/freeCourseCertificateService";

const PLACEHOLDERS = [
  ["{{name}}", "the learner's name"],
  ["{{courseTitle}}", "the course title"],
  ["{{certificateNo}}", "e.g. GRD-2026-7K4M9QX2"],
];

export default function CertificateEmailTab({
  courseId,
  onSaved,
}: {
  courseId: string;
  onSaved?: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { admin } = useAuth();
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testName, setTestName] = useState("");
  const [sending, setSending] = useState(false);

  // Prefill once the admin resolves — AuthContext is still loading on first
  // render, so seeding the initial state would leave the fields empty.
  useEffect(() => {
    if (admin?.email) setTestTo((current) => current || admin.email);
    if (admin?.name) setTestName((current) => current || admin.name);
  }, [admin?.email, admin?.name]);

  const handleSendTest = async () => {
    if (!testTo.trim()) {
      toast.error("Enter an address to send to");
      return;
    }

    setSending(true);
    try {
      // The editor's current contents, not the saved row: the point of a test
      // is to check what is on screen, which right after an edit is not what is
      // in the database.
      const response = await freeCourseCertificateService.sendTestEmail(
        courseId,
        {
          subject,
          body,
          to: testTo.trim(),
          recipientName: testName.trim(),
        },
      );

      toast.success(response?.message || `Test email sent to ${testTo}`);
      setTestOpen(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not send the test email"));
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    freeCourseCertificateService
      .getEmailTemplate(courseId)
      .then((template) => {
        if (!template) return;
        setSubject(template.subject || "");
        setBody(template.body || "");
        setIsEnabled(template.isEnabled);
      })
      .catch(() => {
        // No template yet is the normal starting state.
      })
      .finally(() => setLoading(false));
  }, [courseId]);

  const handleSave = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Both a subject and a body are required");
      return;
    }

    setSaving(true);
    try {
      await freeCourseCertificateService.saveEmailTemplate(courseId, {
        subject,
        body,
        isEnabled,
      });
      toast.success("Certificate email saved");
      onSaved?.();
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
      {/* Actions at the top, mirroring the Design tab. The body editor is tall
          enough that a footer row sits below the fold on any normal screen —
          Save is not something an admin should have to go looking for. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Certificate email</p>

        <div className="flex items-center gap-2">
          {/* Disabled until there is something to send, so a test cannot go out
              as an empty shell that tells the admin nothing. */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setTestOpen(true)}
            disabled={!subject.trim() || !body.trim()}
          >
            <Send className="h-4 w-4" />
            Send test
          </Button>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save email
          </Button>
        </div>
      </div>

      {/* One idea per box. This one is about what to write; the consequence of
          leaving it unwritten belongs on the switch below, which is the control
          that causes it. */}
      <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          Don&apos;t include a download link — there isn&apos;t one to give.
        </span>{" "}
        Certificates are private files. Learners sign in and download theirs from
        their dashboard on the website, so this email just needs to tell them
        it&apos;s ready and point them there.
      </div>

      <div className="flex items-center justify-between rounded-md border border-border p-3">
        <div>
          <Label htmlFor="certificate-email-enabled">Send this email</Label>
          {/* "Nothing is created" rather than "nothing is sent", because that is
              the surprising half: no PDF either. An Issued row nobody received
              reads as success everywhere it is counted, so the feature refuses
              to make one. */}
          <p className="mt-0.5 text-xs text-muted-foreground">
            Turn this off to save a draft without sending it. While it&apos;s
            off, finishing the course creates no certificate at all — so nobody
            ends up holding one that was never sent to them.
          </p>
        </div>
        <Switch
          id="certificate-email-enabled"
          checked={isEnabled}
          onCheckedChange={setIsEnabled}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="certificate-subject">Subject</Label>
        <Input
          id="certificate-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Your certificate for {{courseTitle}}"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Body</Label>
        <EmailEditor value={body} onChange={setBody} />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {PLACEHOLDERS.map(([token, meaning]) => (
          <span key={token}>
            <code className="rounded bg-muted px-1 py-0.5">{token}</code>{" "}
            {meaning}
          </span>
        ))}
      </div>


      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        {/* No DialogDescription here, so opt out of Radix's describedby wiring
            rather than let it warn about a missing one on every open. */}
        <DialogContent
          className="grid-rows-[auto_minmax(0,1fr)_auto] max-h-[85dvh]"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>Send a test certificate email</DialogTitle>
          </DialogHeader>

          {/* Same guard as the copy dialog — DialogContent sets no height
              ceiling, so on a short viewport this would overflow off the top
              where it cannot be scrolled back into view. */}
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="certificate-test-name">Recipient name</Label>
              <Input
                id="certificate-test-name"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                placeholder="Sample Learner"
              />
              <p className="text-xs text-muted-foreground">
                Replaces <code>{"{{name}}"}</code> in the email.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="certificate-test-to">Send to</Label>
              <Input
                id="certificate-test-to"
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="you@theproductspace.co.in"
              />
            </div>

            {/* Both are things the admin would otherwise have to discover from
                the result. The second matters most: testing a parked draft is
                the common case, and it would be reasonable to assume the
                switch blocks it. */}
            <p className="text-xs text-muted-foreground">
              Sends whatever is in the editor right now, saved or not, with{" "}
              <code className="rounded bg-muted px-1 py-0.5">[Test]</code> in
              front of the subject. The &ldquo;Send this email&rdquo; switch
              doesn&apos;t affect a test.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTestOpen(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSendTest} disabled={sending}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
