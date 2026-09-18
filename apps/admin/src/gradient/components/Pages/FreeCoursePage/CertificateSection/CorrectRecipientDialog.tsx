"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { freeCourseCertificateService } from "@/gradient/services/freeCourseCertificateService";
import type { FreeCourseLearner } from "@/gradient/types/freeCourseCertificate";

/**
 * Fix the name printed on a certificate.
 *
 * The old certificate is revoked and a new one issued under a new number,
 * rather than the file being swapped in place. The original PDF may already
 * have been downloaded or shared, and quietly changing what sits behind a
 * number somebody has passed on is worse than issuing a replacement.
 */
export default function CorrectRecipientDialog({
  learner,
  onClose,
  onDone,
}: {
  learner: FreeCourseLearner | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const certificate = learner?.certificate ?? null;

  useEffect(() => {
    setName(certificate?.recipientName ?? "");
  }, [certificate]);

  const handleSave = async () => {
    if (!certificate) return;

    if (!name.trim()) {
      toast.error("A name is required");
      return;
    }

    setSaving(true);
    try {
      const result = await freeCourseCertificateService.correctRecipient(
        certificate.id,
        name.trim(),
      );
      toast.success(`Issuing ${result.certificateNo}`);
      onDone();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not correct the name"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!certificate} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Correct the name</DialogTitle>
          <DialogDescription>
            {certificate?.certificateNo} will be revoked and a replacement
            issued under a new number. The learner keeps exactly one live
            certificate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="correct-name">Name on the certificate</Label>
          <Input
            id="correct-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Sent to {certificate?.recipientEmail}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Revoke and reissue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
