import EmailEditor from "@/gradient/components/ui/EmailEditor/EmailEditor";
import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/gradient/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
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
import { Loader2, Copy, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";
import {
  SENDER_EMAIL_OPTIONS,
  TARGET_ATTENDEE_OPTIONS,
  TARGET_STATUS_OPTIONS,
} from "@/gradient/constants/event.constants";
import { ReminderPayload } from "@/gradient/services/eventReminderService";
import { Reminder, toDateTimeLocalValue } from "../../types";

// ── Create / Edit Modal ────────────────────────────────────────────────────────

interface ReminderFormModalProps {
  open: boolean;
  onClose: () => void;
  editingReminder: Reminder | null;
  form: ReminderPayload;
  setField: (key: keyof ReminderPayload, value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}

export function ReminderFormModal({
  open,
  onClose,
  editingReminder,
  form,
  setField,
  onSubmit,
  submitting,
}: ReminderFormModalProps) {
  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="min-w-[75vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between mr-14">
          <DialogTitle>
            {editingReminder ? "Edit Reminder" : "Create Reminder"}
          </DialogTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                localStorage.setItem(
                  "reminder_template_clipboard",
                  JSON.stringify({
                    subject: form.subject,
                    body: form.body,
                    senderEmail: form.senderEmail,
                    targetStatus: form.targetStatus,
                    targetAttendeeType: form.targetAttendeeType,
                  }),
                );
                toast.success("Template copied to clipboard");
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy Template
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const clipboard = localStorage.getItem(
                  "reminder_template_clipboard",
                );
                if (clipboard) {
                  const data = JSON.parse(clipboard);
                  if (data.subject) setField("subject", data.subject);
                  if (data.body) setField("body", data.body);
                  if (data.senderEmail)
                    setField("senderEmail", data.senderEmail);
                  if (data.targetStatus)
                    setField("targetStatus", data.targetStatus);
                  if (data.targetAttendeeType)
                    setField("targetAttendeeType", data.targetAttendeeType);
                  toast.success("Template pasted");
                } else {
                  toast.error("No template found in clipboard");
                }
              }}
            >
              <ClipboardPaste className="mr-2 h-4 w-4" />
              Paste Template
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input
              placeholder="Enter the template name"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Subject</Label>
            <Input
              placeholder="Email subject"
              value={form.subject}
              onChange={(e) => setField("subject", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Sender Email</Label>
            <Select
              value={form.senderEmail}
              onValueChange={(val) => setField("senderEmail", val)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select sender" />
              </SelectTrigger>
              <SelectContent>
                {SENDER_EMAIL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label} - {opt.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Target Status</Label>
              <Select
                value={form.targetStatus ?? ""}
                onValueChange={(val) => setField("targetStatus", val)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Any status" />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Target Attendee Type</Label>
              <Select
                value={form.targetAttendeeType ?? ""}
                onValueChange={(val) => setField("targetAttendeeType", val)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Any type" />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_ATTENDEE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Body</Label>
            <EmailEditor
              value={form.body}
              onChange={(val) => setField("body", val)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingReminder ? "Save Changes" : "Create Reminder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Schedule Modal ─────────────────────────────────────────────────────────────

interface ScheduleModalProps {
  target: Reminder | null;
  scheduledAt: string;
  onChangeScheduledAt: (val: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  scheduling: boolean;
}

export function ScheduleModal({
  target,
  scheduledAt,
  onChangeScheduledAt,
  onClose,
  onConfirm,
  scheduling,
}: ScheduleModalProps) {
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Schedule Reminder</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Date & Time</Label>
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => onChangeScheduledAt(e.target.value)}
            min={toDateTimeLocalValue(new Date())}
          />
          <p className="text-xs text-muted-foreground">
            Your local time ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={scheduling}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={scheduling || !scheduledAt}>
            {scheduling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Send Now Confirmation ──────────────────────────────────────────────────────

interface SendNowDialogProps {
  target: Reminder | null;
  onClose: () => void;
  onConfirm: () => void;
  sending: boolean;
}

export function SendNowDialog({
  target,
  onClose,
  onConfirm,
  sending,
}: SendNowDialogProps) {
  return (
    <AlertDialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send Reminder Now</AlertDialogTitle>
          <AlertDialogDescription>
            This will immediately trigger <strong>{target?.name}</strong> to all
            matching attendees. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={sending}>
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send Now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Cancel Schedule Confirmation ───────────────────────────────────────────────

interface CancelScheduleDialogProps {
  target: Reminder | null;
  onClose: () => void;
  onConfirm: () => void;
  cancelling: boolean;
}

export function CancelScheduleDialog({
  target,
  onClose,
  onConfirm,
  cancelling,
}: CancelScheduleDialogProps) {
  return (
    <AlertDialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel Scheduled Reminder</AlertDialogTitle>
          <AlertDialogDescription>
            This will unschedule <strong>{target?.name}</strong> and reset it to
            pending. You can reschedule it later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelling}>
            Keep Scheduled
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={cancelling}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {cancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cancel Schedule
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Delete Confirmation ────────────────────────────────────────────────────────

interface DeleteDialogProps {
  target: Reminder | null;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
}

export function DeleteDialog({
  target,
  onClose,
  onConfirm,
  deleting,
}: DeleteDialogProps) {
  return (
    <AlertDialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Reminder</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong>{target?.name}</strong>?
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// SEND TEST MAIL

interface SendTestEmailDialogProps {
  target: Reminder | null;
  recipientName: string;
  to: string;
  onChangeRecipientName: (val: string) => void;
  onChangeTo: (val: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  sending: boolean;
}

export function SendTestEmailDialog({
  target,
  recipientName,
  to,
  onChangeRecipientName,
  onChangeTo,
  onClose,
  onConfirm,
  sending,
}: SendTestEmailDialogProps) {
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send Test Email</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Recipient Name</Label>
            <Input
              placeholder="Enter recipient name"
              value={recipientName}
              onChange={(e) => onChangeRecipientName(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Recipient Email</Label>
            <Input
              type="email"
              placeholder="Enter recipient email"
              value={to}
              onChange={(e) => onChangeTo(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>

          <Button
            onClick={onConfirm}
            disabled={sending || !recipientName || !to}
          >
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send Test Email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
