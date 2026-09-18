"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ClipboardCopy,
  ClipboardPaste,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/gradient/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { useAuth } from "@/gradient/context/AuthContext";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { useEmailTemplateClip } from "@/gradient/lib/emailTemplateClipboard";
import { findUnresolvedTokens, isBlankHtml } from "@/gradient/lib/eventEmailTemplates";
import { eventService } from "@/gradient/services/eventService";

interface EmailTemplateToolbarProps {
  eventId: string;
  /** Template type being edited — "Approved", "Certificate", … */
  type: string;
  eventTitle: string;
  subject: string;
  body: string;
  /** Fills the editor's local state. Never saves — the admin still presses Save. */
  onPaste: (next: { subject: string; body: string }) => void;
}

export default function EmailTemplateToolbar({
  eventId,
  type,
  eventTitle,
  subject,
  body,
  onPaste,
}: EmailTemplateToolbarProps) {
  const { admin } = useAuth();
  const { clip, copy, clear } = useEmailTemplateClip();

  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false);
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

  // Computed from the live fields rather than latched after a paste, so the
  // warning also catches a hand-typed token and clears itself once fixed.
  const unresolved = findUnresolvedTokens(type, subject, body);
  const hasUnresolved =
    unresolved.subject.length > 0 || unresolved.body.length > 0;
  const hasContent = Boolean(subject.trim()) || !isBlankHtml(body);

  const handleCopy = () => {
    if (!hasContent) {
      toast.error("Nothing to copy yet");
      return;
    }

    copy({ subject, body, source: { eventTitle, type } });
    toast.success(`Copied the ${type} email`);
  };

  const applyPaste = () => {
    if (!clip) return;

    onPaste({ subject: clip.subject, body: clip.body });
    setConfirmingOverwrite(false);
    toast.success("Pasted — press Save to keep it");
  };

  const handlePaste = () => {
    if (!clip) return;

    if (hasContent) {
      setConfirmingOverwrite(true);
      return;
    }

    applyPaste();
  };

  const handleSendTest = async () => {
    if (!testTo.trim()) {
      toast.error("Enter an address to send to");
      return;
    }

    setSending(true);
    try {
      const response = await eventService.sendTestTemplateEmail(eventId, {
        type,
        subject,
        body,
        to: testTo.trim(),
        recipientName: testName.trim(),
      });

      toast.success(response?.message || `Test email sent to ${testTo}`);
      setTestOpen(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not send the test email"));
    } finally {
      setSending(false);
    }
  };

  const renderTokens = (tokens: string[]) =>
    tokens.map((token, index) => (
      <span key={token}>
        {index > 0 && ", "}
        <code className="rounded bg-amber-100 px-1 py-0.5 dark:bg-amber-900/60">
          {`{{${token}}}`}
        </code>
      </span>
    ));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
          <ClipboardCopy className="h-4 w-4" />
          Copy
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePaste}
          disabled={!clip}
        >
          <ClipboardPaste className="h-4 w-4" />
          Paste
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setTestOpen(true)}
          disabled={!hasContent}
        >
          <Send className="h-4 w-4" />
          Send test
        </Button>

        {clip ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            Holding <span className="font-medium">{clip.source.type}</span>
            {clip.source.eventTitle ? ` from ${clip.source.eventTitle}` : null}
            <button
              type="button"
              onClick={clear}
              aria-label="Clear the copied template"
              className="rounded p-0.5 hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            Copy here, then paste into another template
          </span>
        )}
      </div>

      {hasUnresolved && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="space-y-1">
            <p>
              A {type} email does not fill these in — recipients see the text
              exactly as written:
            </p>
            <ul className="list-disc space-y-0.5 pl-4">
              {unresolved.subject.length > 0 && (
                <li>in the subject: {renderTokens(unresolved.subject)}</li>
              )}
              {unresolved.body.length > 0 && (
                <li>in the body: {renderTokens(unresolved.body)}</li>
              )}
            </ul>
          </div>
        </div>
      )}

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        {/* No DialogDescription here, so opt out of Radix's describedby wiring
            rather than let it warn about a missing one on every open. */}
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Send a test {type} email</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="test-email-name">Recipient name</Label>
              <Input
                id="test-email-name"
                value={testName}
                onChange={(event) => setTestName(event.target.value)}
                placeholder="Sample Recipient"
              />
              <p className="text-xs text-muted-foreground">
                Replaces <code>{"{{name}}"}</code> in the email.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="test-email-to">Send to</Label>
              <Input
                id="test-email-to"
                type="email"
                value={testTo}
                onChange={(event) => setTestTo(event.target.value)}
                placeholder="you@theproductspace.co.in"
              />
            </div>
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

      <AlertDialog
        open={confirmingOverwrite}
        onOpenChange={setConfirmingOverwrite}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace this email?</AlertDialogTitle>
            <AlertDialogDescription>
              The {type} subject and body will be overwritten by the copied{" "}
              {clip?.source.type} email. Nothing is saved until you press Save,
              so closing without saving leaves the original untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applyPaste}>Paste</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
