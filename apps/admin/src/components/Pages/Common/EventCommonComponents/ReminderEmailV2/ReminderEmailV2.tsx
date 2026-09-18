"use client";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Mail,
  Clock,
  Calendar,
  Trash2,
  Edit,
  Loader2,
  MoreVertical,
  Send,
  XCircle,
  Users,
  Briefcase,
  FlaskConical,
} from "lucide-react";
import { usePathname } from "next/navigation";
import {
  createEmailTemplate,
  getEmailTemplates,
  updateEmailTemplateV2,
  deleteEmailTemplateV2,
  scheduleEmailTemplate,
  cancelEmailTemplateSchedule,
  sendTestEmailTemplate,
  sendReminderEmailNow,
} from "@/services/Events/reminderEmailService";
import { useNotification } from "@/helpers/NotificationContext";

import {
  EventEmailTemplate,
  EVENT_EMAIL_TARGET_TYPES,
  EVENT_EMAIL_TARGET_ROLES,
  EVENT_EMAIL_TEMPLATE_STATUS,
} from "./types";
import { formatDataTime } from "@/utils/formatDataTime";
import EmailTextEditor3 from "@/components/Rich-Text-Editor/EmailTextEditor3";

export default function ReminderEmailV2() {
  const { showNotification } = useNotification();
  const pathname = usePathname();
  const [eventId, setEventId] = useState<string>("");
  const [sendNowId, setSendNowId] = useState<number | null>(null);
  const [templates, setTemplates] = useState<EventEmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<EventEmailTemplate | null>(null);

  // Dialog & Alert States
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [templateToSchedule, setTemplateToSchedule] = useState<number | null>(
    null,
  );
  const [scheduleDate, setScheduleDate] = useState("");
  const [copiedContent, setCopiedContent] = useState<{
    subject: string;
    body: string;
  } | null>(null);

  // Test Email States
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  const [testTemplateId, setTestTemplateId] = useState<number | null>(null);
  const [testFormData, setTestFormData] = useState({ email: "", name: "" });

  const [formData, setFormData] = useState({
    templateName: "",
    subject: "",
    body: "",
    targetGuestType: EVENT_EMAIL_TARGET_TYPES.ALL as string,
    targetGuestRole: EVENT_EMAIL_TARGET_ROLES.ALL as string,
    scheduledAt: "",
  });

  const fetchTemplates = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        const response = await getEmailTemplates(id);
        setTemplates(response.templates || []);
      } catch (error) {
        console.error("Error fetching templates:", error);
        showNotification("error", "Error", "Failed to fetch email templates");
      } finally {
        setLoading(false);
      }
    },
    [showNotification],
  );

  useEffect(() => {
    if (pathname) {
      const parts = pathname.split("/");
      const id = parts[parts.length - 1];
      setEventId(id);
      fetchTemplates(id);
    }
  }, [pathname, fetchTemplates]);

  useEffect(() => {
    const savedContent = sessionStorage.getItem("reminder_email_clipboard");
    if (savedContent) {
      try {
        setCopiedContent(JSON.parse(savedContent));
      } catch (e) {
        console.error("Failed to parse saved email content", e);
      }
    }
  }, []);

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setFormData({
      templateName: "",
      subject: "",
      body: "",
      targetGuestType: EVENT_EMAIL_TARGET_TYPES.ALL,
      targetGuestRole: EVENT_EMAIL_TARGET_ROLES.ALL,
      scheduledAt: "",
    });
    setEditingTemplate(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.templateName || !formData.subject || !formData.body) {
      showNotification(
        "error",
        "Validation Error",
        "Please fill in all required fields",
      );
      return;
    }

    try {
      setSubmitting(true);
      if (editingTemplate) {
        await updateEmailTemplateV2(editingTemplate.id.toString(), formData);
        showNotification("success", "Success", "Template updated successfully");
      } else {
        await createEmailTemplate(eventId, formData);
        showNotification("success", "Success", "Template created successfully");
      }
      setIsDialogOpen(false);
      resetForm();
      fetchTemplates(eventId);
    } catch (error) {
      console.error("Error saving template:", error);
      showNotification("error", "Error", "Failed to save template");
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (template: EventEmailTemplate) => {
    setEditingTemplate(template);
    setFormData({
      templateName: template.templateName,
      subject: template.subject,
      body: template.body,
      targetGuestType: template.targetGuestType,
      targetGuestRole: template.targetGuestRole,
      scheduledAt: template.scheduledAt || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteEmailTemplateV2(deleteId.toString());
      showNotification("success", "Deleted", "Template removed successfully");
      fetchTemplates(eventId);
    } catch (error) {
      showNotification("error", "Error", "Failed to delete template");
    } finally {
      setDeleteId(null);
    }
  };

const handleSendNow = async () => {
  if (!sendNowId) return;

  try {
    setSubmitting(true);

    await sendReminderEmailNow(sendNowId.toString());

    showNotification(
      "success",
      "Email Sent",
      "Reminder email has been sent successfully"
    );

    fetchTemplates(eventId);
  } catch (error) {
    console.error("Error sending email now:", error);
    showNotification("error", "Error", "Failed to send reminder email");
  } finally {
    setSubmitting(false);
    setSendNowId(null);
  }
};

  const handleSchedule = async () => {
    if (!templateToSchedule || !scheduleDate) return;
    try {
      setSubmitting(true);
      await scheduleEmailTemplate(
        templateToSchedule.toString(),
        new Date(scheduleDate).toISOString(),
      );
      showNotification("success", "Scheduled", "Email scheduled successfully");
      setIsScheduleDialogOpen(false);
      setTemplateToSchedule(null);
      setScheduleDate("");
      fetchTemplates(eventId);
    } catch (error) {
      showNotification("error", "Error", "Failed to schedule email");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelSchedule = async (templateId: number) => {
    try {
      await cancelEmailTemplateSchedule(templateId.toString());
      showNotification(
        "success",
        "Cancelled",
        "Schedule cancelled successfully",
      );
      fetchTemplates(eventId);
    } catch (error) {
      showNotification("error", "Error", "Failed to cancel schedule");
    }
  };

  const handleCopy = (template: EventEmailTemplate) => {
    const content = {
      subject: template.subject,
      body: template.body,
    };
    setCopiedContent(content);
    sessionStorage.setItem("reminder_email_clipboard", JSON.stringify(content));
    showNotification(
      "success",
      "Copied",
      "Template content copied to clipboard",
    );
  };

  const handleCopyInDialog = () => {
    if (formData.subject && formData.body) {
      const content = {
        subject: formData.subject,
        body: formData.body,
      };
      setCopiedContent(content);
      sessionStorage.setItem(
        "reminder_email_clipboard",
        JSON.stringify(content),
      );
      showNotification("success", "Copied", "Current content copied");
    }
  };

  const handlePaste = () => {
    if (copiedContent) {
      setFormData((prev) => ({
        ...prev,
        subject: copiedContent.subject,
        body: copiedContent.body,
      }));
      showNotification("success", "Pasted", "Content pasted successfully");
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testTemplateId || !testFormData.email || !testFormData.name) {
      showNotification("error", "Error", "Please fill in all fields");
      return;
    }

    try {
      setSubmitting(true);
      await sendTestEmailTemplate(testTemplateId.toString(), testFormData);
      showNotification("success", "Success", "Test email sent successfully");
      setIsTestDialogOpen(false);
      setTestFormData({ email: "", name: "" });
    } catch (error) {
      showNotification("error", "Error", "Failed to send test email");
    } finally {
      setSubmitting(false);
    }
  };

  const getMinDateTime = () => {
    const now = new Date();
    now.setSeconds(0, 0);
    return now.toISOString().slice(0, 16);
  };

  const getStatusBadge = (status: string) => {
    const base =
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[7px] text-xs font-medium border";

    switch (status) {
      case EVENT_EMAIL_TEMPLATE_STATUS.SCHEDULED:
        return (
          <Badge className={`${base} bg-blue-50 text-blue-700 border-blue-200`}>
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            Scheduled
          </Badge>
        );

      case EVENT_EMAIL_TEMPLATE_STATUS.SENT:
        return (
          <Badge
            className={`${base} bg-emerald-50 text-emerald-700 border-emerald-200`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Sent
          </Badge>
        );

      case EVENT_EMAIL_TEMPLATE_STATUS.FAILED:
        return (
          <Badge className={`${base} bg-red-50 text-red-700 border-red-200`}>
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            Failed
          </Badge>
        );

      default:
        return (
          <Badge
            className={`${base} bg-gray-100 text-gray-700 border-gray-200`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
            Draft
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-end">
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Add Template
            </Button>
          </DialogTrigger>
          <DialogContent className="min-w-[70vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between pr-8">
                <div>
                  <DialogTitle>
                    {editingTemplate ? "Edit Template" : "Create New Template"}
                  </DialogTitle>
                  <DialogDescription>
                    Fill in the details for your email reminder template.
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyInDialog}
                    className="flex items-center gap-2"
                  >
                    <Mail className="h-4 w-4" />
                    Copy Content
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePaste}
                    className="flex items-center gap-2 border-dashed"
                  >
                    <Send className="h-4 w-4 rotate-90" />
                    Paste Content
                  </Button>
                </div>
              </div>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="templateName">Template Name</Label>
                  <Input
                    id="templateName"
                    placeholder="e.g., 24h Before Reminder"
                    value={formData.templateName}
                    onChange={(e) =>
                      handleInputChange("templateName", e.target.value)
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="targetGuestType">Target Audience</Label>

                  <Select
                    value={formData.targetGuestType}
                    onValueChange={(value) =>
                      handleInputChange("targetGuestType", value)
                    }
                  >
                    <SelectTrigger id="targetGuestType" className="w-full">
                      <SelectValue placeholder="Select target audience" />
                    </SelectTrigger>

                    <SelectContent>
                      {Object.entries(EVENT_EMAIL_TARGET_TYPES).map(
                        ([key, value]) => (
                          <SelectItem key={value} value={value}>
                            {key}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="targetGuestRole">Guest Role</Label>

                  <Select
                    value={formData.targetGuestRole}
                    onValueChange={(value) =>
                      handleInputChange("targetGuestRole", value)
                    }
                  >
                    <SelectTrigger id="targetGuestRole" className="w-full">
                      <SelectValue placeholder="Select guest role" />
                    </SelectTrigger>

                    <SelectContent>
                      {Object.entries(EVENT_EMAIL_TARGET_ROLES).map(
                        ([key, value]) => (
                          <SelectItem key={value} value={value}>
                            {key}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Email Subject</Label>
                <Input
                  id="subject"
                  placeholder="The event is starting soon!"
                  value={formData.subject}
                  onChange={(e) => handleInputChange("subject", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Email Content</Label>
                <div className="min-h-[300px] rounded-md border bg-muted/5">
                  <EmailTextEditor3
                    value={formData.body}
                    onChange={(val: string) => handleInputChange("body", val)}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {editingTemplate ? "Update Template" : "Create Template"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <Card
            key={template.id}
            className="group relative bg-white rounded-lg border border-gray-200 transition-all hover:border-gray-300 hover:shadow-sm w-full"
          >
            <CardHeader className="px-4 ">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-[15px] font-medium text-gray-900 break-words">
                      {template.templateName}
                    </h3>
                    <span className="shrink-0">
                      {getStatusBadge(template.status)}
                    </span>
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-gray-400 hover:text-gray-600"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => handleCopy(template)}>
                      <Mail className="mr-2 h-4 w-4" /> Copy
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openEdit(template)}>
                      <Edit className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setTestTemplateId(template.id);
                        setIsTestDialogOpen(true);
                      }}
                    >
                      <FlaskConical className="mr-2 h-4 w-4" /> Test
                    </DropdownMenuItem>

                    <DropdownMenuItem onClick={() => setSendNowId(template.id)}>
                      <Send className="mr-2 h-4 w-4" /> Send Now
                    </DropdownMenuItem>

                   {template.status === EVENT_EMAIL_TEMPLATE_STATUS.DRAFT && (
                      <DropdownMenuItem
                        onClick={() => {
                          setTemplateToSchedule(template.id);
                          setIsScheduleDialogOpen(true);
                        }}
                      >
                        <Clock className="mr-2 h-4 w-4" /> Schedule
                      </DropdownMenuItem>
                    )}
                    {template.scheduledAt && (
                      <DropdownMenuItem
                        onClick={() => handleCancelSchedule(template.id)}
                      >
                        <XCircle className="mr-2 h-4 w-4" /> Cancel
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-red-600"
                      onClick={() => setDeleteId(template.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>

            <CardContent className="px-4  space-y-3">
              {/* Subject - full content visible */}
              <div className="text-sm text-gray-600 whitespace-normal break-words">
                {template.subject || (
                  <span className="text-gray-400 italic">No subject</span>
                )}
              </div>

              {/* Meta row - wraps naturally */}
              <div className="flex flex-col gap-4 text-sm">
                <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                  <span className="text-gray-500">User Status</span>
                  <span className="font-medium text-gray-900">
                    {template.targetGuestType}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-500">User Type</span>
                  <span className="font-medium text-gray-900">
                    {template.targetGuestRole}
                  </span>
                </div>
              </div>

              {/* Schedule - full date visible */}
              <div className="flex items-center gap-2  text-gray-500 pt-4 border-t border-gray-100 ">
                <Calendar className="h-3.5 w-3.5 text-gray-700 shrink-0" />
                {template.scheduledAt ? (
                  <span className="text-gray-700 whitespace-normal text-[15px]">
                    {formatDataTime(template.scheduledAt)}
                  </span>
                ) : (
                  <span className="text-gray-400">Not scheduled</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* No Template is Added */}
      {templates.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <Mail className="h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">No Templates Created</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Get started by creating your first email reminder template.
          </p>
          <Button variant="outline" onClick={() => setIsDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create Now
          </Button>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              email template and any pending schedule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Schedule Dialog */}
      <Dialog
        open={isScheduleDialogOpen}
        onOpenChange={(open) => {
          setIsScheduleDialogOpen(open);
          if (!open) {
            setTemplateToSchedule(null);
            setScheduleDate("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Schedule Email</DialogTitle>
            <DialogDescription>
              Select the date and time you want this email to be sent.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="date">Scheduled Date & Time</Label>
              <Input
                id="date"
                type="datetime-local"
                value={scheduleDate}
                min={getMinDateTime()}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setIsScheduleDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSchedule}
              disabled={submitting || !scheduleDate}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Schedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test Email Dialog */}
      <Dialog
        open={isTestDialogOpen}
        onOpenChange={(open) => {
          setIsTestDialogOpen(open);
          if (!open) {
            setTestTemplateId(null);
            setTestFormData({ email: "", name: "" });
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>
              Specify the recipient details to see how the email looks.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSendTestEmail} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="testName">Recipient Name</Label>
              <Input
                id="testName"
                placeholder="Enter Recipient Name"
                value={testFormData.name}
                onChange={(e) =>
                  setTestFormData((p) => ({ ...p, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="testEmail">Recipient Email</Label>
              <Input
                id="testEmail"
                type="email"
                placeholder="Enter Recipient Email"
                value={testFormData.email}
                onChange={(e) =>
                  setTestFormData((p) => ({ ...p, email: e.target.value }))
                }
                required
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTestDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Send Test
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Send Now Confirmation */}
      <AlertDialog open={!!sendNowId} onOpenChange={() => setSendNowId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this email now?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will immediately send the reminder email to all
              selected recipients. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSendNow}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm & Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
