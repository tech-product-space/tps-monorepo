"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { eventCertificateService } from "@/gradient/services/eventCertificateService";
import { EventCertificateRow } from "@/gradient/types/eventCertificate";

interface CorrectRecipientDialogProps {
  certificate: EventCertificateRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function CorrectRecipientDialog({
  certificate,
  onClose,
  onSaved,
}: CorrectRecipientDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!certificate) return;
    setName(certificate.recipientName);
    setEmail(certificate.recipientEmail);
    setNote("");
  }, [certificate]);

  if (!certificate) return null;

  const isIssued = certificate.status === "Issued";
  const changed =
    name.trim() !== certificate.recipientName ||
    email.trim().toLowerCase() !== certificate.recipientEmail;

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await eventCertificateService.correctRecipient(
        certificate.id,
        { name: name.trim(), email: email.trim(), note: note.trim() || undefined },
      );
      toast.success(result.message);
      onSaved();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not correct the recipient"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Correct recipient</DialogTitle>
          <DialogDescription>
            For fixing a typo the team has told you about.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="correct-name">Name</Label>
            <Input
              id="correct-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="correct-email">Email</Label>
            <Input
              id="correct-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="correct-note">Note (optional)</Label>
            <Input
              id="correct-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. team emailed about the typo"
            />
          </div>

          {/* The two branches differ sharply, so say which one this is before
              the admin commits to it. */}
          <div
            className={`rounded-md border p-3 text-xs ${
              isIssued
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
                : "border-border text-muted-foreground"
            }`}
          >
            {isIssued ? (
              <p className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  This certificate has already been issued. Correcting it will
                  <strong> revoke {certificate.certificateNo}</strong> and create
                  a replacement with a new number. The old link stops working.
                </span>
              </p>
            ) : (
              <p>
                This certificate has not been sent yet, so it will be updated in
                place and keep its number.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !changed}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save (does not send)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
