"use client";

import { useEffect, useState } from "react";
import { Button } from "@/gradient/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import reminderService, {
  ReminderFilters,
  ReminderPayload,
} from "@/gradient/services/eventReminderService";
import ReminderTable from "./ReminderTable/ReminderTable";
import {
  ReminderFormModal,
  ScheduleModal,
  SendNowDialog,
  CancelScheduleDialog,
  DeleteDialog,
  SendTestEmailDialog,
} from "./ReminderModals/ReminderModals";
import { EMPTY_FORM, Reminder, toDateTimeLocalValue } from "../types";

export default function ReminderEmailSection({ eventId }: { eventId: string }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  // Create / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [form, setForm] = useState<ReminderPayload>({ ...EMPTY_FORM, eventId });
  const [submitting, setSubmitting] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Reminder | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Schedule modal
  const [scheduleTarget, setScheduleTarget] = useState<Reminder | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduling, setScheduling] = useState(false);

  // Send-now confirmation
  const [sendNowTarget, setSendNowTarget] = useState<Reminder | null>(null);
  const [sendingNow, setSendingNow] = useState(false);

  // Send test mail
  const [testEmailTarget, setTestEmailTarget] = useState<Reminder | null>(null);
  const [testEmailRecipient, setTestEmailRecipient] = useState("");
  const [testEmailTo, setTestEmailTo] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  // Cancel confirmation
  const [cancelTarget, setCancelTarget] = useState<Reminder | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const fetchReminders = async () => {
    setLoading(true);
    try {
      const filters: ReminderFilters = { eventId };
      const data = await reminderService.listReminders(filters);
      setReminders(data);
    } catch {
      toast.error("Failed to load reminders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReminders();
  }, [eventId]);

  // ── Create / Edit ────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingReminder(null);
    setForm({ ...EMPTY_FORM, eventId });
    setModalOpen(true);
  };

  const openEdit = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setForm({
      eventId: reminder.eventId,
      name: reminder.name,
      subject: reminder.subject,
      body: reminder.body,
      senderEmail: reminder.senderEmail,
      targetStatus: reminder.targetStatus ?? "",
      targetAttendeeType: reminder.targetAttendeeType ?? "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.subject || !form.body || !form.senderEmail) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSubmitting(true);
    try {
      if (editingReminder) {
        await reminderService.updateReminder(editingReminder.id, form);
        toast.success("Reminder updated");
      } else {
        await reminderService.createReminder(form);
        toast.success("Reminder created");
      }
      setModalOpen(false);
      setEditingReminder(null);
      fetchReminders();
    } catch {
      toast.error(
        editingReminder
          ? "Failed to update reminder"
          : "Failed to create reminder",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await reminderService.removeReminder(deleteTarget.id);
      toast.success("Reminder deleted");
      setDeleteTarget(null);
      fetchReminders();
    } catch {
      toast.error("Failed to delete reminder");
    } finally {
      setDeleting(false);
    }
  };

  // ── Schedule ─────────────────────────────────────────────────────────────────

  const openSchedule = (reminder: Reminder) => {
    setScheduleTarget(reminder);
    setScheduledAt(toDateTimeLocalValue(reminder.scheduledAt));
  };

  const handleSchedule = async () => {
    if (!scheduleTarget || !scheduledAt) {
      toast.error("Please select a date and time");
      return;
    }
    // Agenda fires a past date on its next tick, which looks like the schedule
    // being ignored. "Send Now" is the deliberate way to do that.
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      toast.error("Pick a time in the future, or use Send Now");
      return;
    }
    setScheduling(true);
    try {
      await reminderService.scheduleReminder(
        scheduleTarget.id,
        new Date(scheduledAt).toISOString(),
      );
      toast.success("Reminder scheduled");
      setScheduleTarget(null);
      fetchReminders();
    } catch {
      toast.error("Failed to schedule reminder");
    } finally {
      setScheduling(false);
    }
  };

  // ── Send Now ─────────────────────────────────────────────────────────────────

  const handleSendNow = async () => {
    if (!sendNowTarget) return;
    setSendingNow(true);
    try {
      await reminderService.sendReminderNow(sendNowTarget.id);
      toast.success("Reminder job triggered");
      setSendNowTarget(null);
      fetchReminders();
    } catch {
      toast.error("Failed to trigger reminder");
    } finally {
      setSendingNow(false);
    }
  };

  // ── Send Test Mail ─────────────────────────────────────────────────────────────────

  const handleSendTestEmail = async () => {
    if (!testEmailTarget || !testEmailRecipient || !testEmailTo) {
      toast.error("Please fill all fields");
      return;
    }

    setSendingTest(true);
    try {
      await reminderService.sendTestEmail(testEmailTarget.id, {
        recipientName: testEmailRecipient,
        to: testEmailTo,
      });

      toast.success("Test email sent");
      setTestEmailTarget(null);
    } catch {
      toast.error("Failed to send test email");
    } finally {
      setSendingTest(false);
    }
  };

  // ── Cancel ───────────────────────────────────────────────────────────────────

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await reminderService.cancelReminder(cancelTarget.id);
      toast.success("Reminder cancelled");
      setCancelTarget(null);
      fetchReminders();
    } catch {
      toast.error("Failed to cancel reminder");
    } finally {
      setCancelling(false);
    }
  };

  // ── Field helper ─────────────────────────────────────────────────────────────

  const setField = (key: keyof ReminderPayload, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Email Reminders</h3>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Reminder
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : reminders.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No reminders yet. Click <strong>Add Reminder</strong> to create one.
        </p>
      ) : (
        <div className="bg-white roundde-lg p-2">
          <ReminderTable
            reminders={reminders}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
            onSchedule={openSchedule}
            onCancelSchedule={setCancelTarget}
            onSendNow={setSendNowTarget}
            onSendTestEmail={(reminder) => {
              setTestEmailTarget(reminder);
              setTestEmailRecipient("");
              setTestEmailTo("");
            }}
          />
        </div>
      )}

      <ReminderFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingReminder(null);
        }}
        editingReminder={editingReminder}
        form={form}
        setField={setField}
        onSubmit={handleSubmit}
        submitting={submitting}
      />

      <ScheduleModal
        target={scheduleTarget}
        scheduledAt={scheduledAt}
        onChangeScheduledAt={setScheduledAt}
        onClose={() => setScheduleTarget(null)}
        onConfirm={handleSchedule}
        scheduling={scheduling}
      />

      <SendNowDialog
        target={sendNowTarget}
        onClose={() => setSendNowTarget(null)}
        onConfirm={handleSendNow}
        sending={sendingNow}
      />

      <SendTestEmailDialog
        target={testEmailTarget}
        recipientName={testEmailRecipient}
        to={testEmailTo}
        onChangeRecipientName={setTestEmailRecipient}
        onChangeTo={setTestEmailTo}
        onClose={() => setTestEmailTarget(null)}
        onConfirm={handleSendTestEmail}
        sending={sendingTest}
      />

      <CancelScheduleDialog
        target={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
        cancelling={cancelling}
      />

      <DeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        deleting={deleting}
      />
    </div>
  );
}
