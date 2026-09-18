"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
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
import { Badge } from "@/gradient/components/ui/badge";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { eventCertificateService } from "@/gradient/services/eventCertificateService";
import { CertificateRecipient, RecipientsResponse } from "@/gradient/types/eventCertificate";

interface RecipientsDialogProps {
  eventId: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function RecipientsDialog({
  eventId,
  open,
  onClose,
  onCreated,
}: RecipientsDialogProps) {
  const [data, setData] = useState<RecipientsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setExcluded(new Set());

    eventCertificateService
      .getRecipients(eventId)
      .then(setData)
      .catch((error) =>
        toast.error(getApiErrorMessage(error, "Could not resolve recipients")),
      )
      .finally(() => setLoading(false));
  }, [open, eventId]);

  const toggle = (email: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const pending = (data?.recipients || []).filter((r) => !r.existingCertificate);
  const selected = pending.filter((r) => !excluded.has(r.email));

  const handleCreate = async () => {
    setSaving(true);
    try {
      const result = await eventCertificateService.createRecipients(
        eventId,
        selected.map((r) => r.email),
      );
      toast.success(`${result.created} recipient(s) added`);
      onCreated();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not create recipients"));
    } finally {
      setSaving(false);
    }
  };

  const renderRow = (recipient: CertificateRecipient) => {
    const isExcluded = excluded.has(recipient.email);
    const done = !!recipient.existingCertificate;

    return (
      <label
        key={recipient.email}
        className={`flex items-start gap-3 rounded-md border px-3 py-2.5 ${
          done ? "border-border opacity-60" : "border-border cursor-pointer"
        }`}
      >
        <input
          type="checkbox"
          className="mt-1"
          disabled={done}
          checked={done ? false : !isExcluded}
          onChange={() => toggle(recipient.email)}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{recipient.name}</span>

            {/* Not an exclusion — someone who did the work earns a certificate
                whether or not they registered. The flag is here so a typo'd
                address gets caught before it is emailed into the void. */}
            {!recipient.registered && (
              <Badge variant="outline" className="gap-1 text-[10px] text-amber-600">
                <AlertTriangle className="h-3 w-3" />
                not registered
              </Badge>
            )}

            {done && (
              <Badge variant="secondary" className="text-[10px]">
                {recipient.existingCertificate?.status}
              </Badge>
            )}
          </div>

          <p className="truncate text-xs text-muted-foreground">
            {recipient.email}
          </p>

          <p className="text-[11px] text-muted-foreground">
            {recipient.source === "Teammate" && recipient.namedBy
              ? `Teammate of ${recipient.namedBy}`
              : "Submitted feedback"}
          </p>
        </div>
      </label>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Certificate recipients</DialogTitle>
          <DialogDescription>
            Check the names and addresses. Nothing is sent yet — the ones you add
            go out the next time you generate for their response.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.recipients.length ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium">Nobody qualifies yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Certificates come from feedback submissions and the teammates they
              name.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{data.summary.total} total</Badge>
              <Badge variant="secondary">{data.summary.teammates} teammates</Badge>
              {data.summary.unregistered > 0 && (
                <Badge variant="outline" className="text-amber-600">
                  {data.summary.unregistered} not registered
                </Badge>
              )}
              {data.summary.alreadyIssued > 0 && (
                <Badge variant="outline">
                  {data.summary.alreadyIssued} already have one
                </Badge>
              )}
            </div>

            <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
              {data.recipients.map(renderRow)}
            </div>
          </>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {selected.length} will be added
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !selected.length}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Add {selected.length} recipient{selected.length === 1 ? "" : "s"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
