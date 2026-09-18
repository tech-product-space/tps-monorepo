"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Send, Copy, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";
import EmailTextEditor3 from "@/components/Rich-Text-Editor/EmailTextEditor3";
import type {
  ConditionConfig,
  DelayConfig,
  DurationUnit,
  GoalConfig,
  LeadEventType,
  NodeConfig,
  SendEmailConfig,
  WorkflowNode,
} from "@/types/workflow";
import {
  DURATION_UNITS,
  VERIFIED_SENDERS,
  cleanHtml,
  nodeLabel,
} from "./utils";
import { workflowService } from "@/services/workflow/workflowService";

type Props = {
  node: WorkflowNode | null;
  onClose: () => void;
  onChange: (config: NodeConfig) => void;
  readOnly: boolean;
};

/**
 * Editing model: changes inside the sheet only mutate local state. The user
 * clicks Save to commit to the parent (which persists). Closing the sheet
 * while dirty prompts a discard confirmation so they don't lose work.
 */
export default function NodeConfigSheet({
  node,
  onClose,
  onChange,
  readOnly,
}: Props) {
  const [localConfig, setLocalConfig] = useState<NodeConfig | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  // Reset local buffer whenever the editor switches to a different node.
  useEffect(() => {
    setLocalConfig(node ? (node.config as NodeConfig) : null);
  }, [node?.id]);

  if (!node || !localConfig) return null;

  const dirty = JSON.stringify(localConfig) !== JSON.stringify(node.config);

  const handleSave = () => {
    if (!dirty) {
      onClose();
      return;
    }
    onChange(localConfig);
    onClose();
  };

  const attemptClose = () => {
    if (dirty && !readOnly) {
      setDiscardOpen(true);
    } else {
      onClose();
    }
  };

  return (
    <>
      <Sheet open={!!node} onOpenChange={(o) => !o && attemptClose()}>
        <SheetContent
          className={`${
            node.type === "action.send_email"
              ? "sm:max-w-[820px] w-[90vw]"
              : "sm:max-w-[480px]"
          } overflow-y-auto flex flex-col p-0`}
        >
          <SheetHeader className="px-6 pt-6 pb-4 border-b sticky top-0 bg-background z-10">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle>{nodeLabel(node.type)}</SheetTitle>
                <SheetDescription>
                  {readOnly
                    ? "Read-only — workflow is published."
                    : "Edit the fields below, then click Save."}
                </SheetDescription>
              </div>
              {!readOnly && (
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!dirty}
                  className="shrink-0"
                >
                  {dirty ? "Save" : "Saved"}
                </Button>
              )}
            </div>
          </SheetHeader>

          <div className="px-6 py-4 space-y-4 flex-1">
            {node.type === "action.send_email" && (
              <SendEmailFormFields
                config={localConfig as SendEmailConfig}
                onChange={(c) => setLocalConfig(c)}
                readOnly={readOnly}
              />
            )}

            {node.type === "control.delay" && (
              <DelayFormFields
                config={localConfig as DelayConfig}
                onChange={(c) => setLocalConfig(c)}
                readOnly={readOnly}
              />
            )}

            {node.type === "control.goal" && (
              <GoalFormFields
                config={localConfig as GoalConfig}
                onChange={(c) => setLocalConfig(c)}
                readOnly={readOnly}
              />
            )}

            {node.type === "control.condition" && (
              <ConditionFormFields
                config={localConfig as ConditionConfig}
                onChange={(c) => setLocalConfig(c)}
                readOnly={readOnly}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes on this step. Closing now will discard
              them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDiscardOpen(false);
                onClose();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SendEmailFormFields({
  config,
  onChange,
  readOnly,
}: {
  config: SendEmailConfig;
  onChange: (c: SendEmailConfig) => void;
  readOnly: boolean;
}) {
  const update = (patch: Partial<SendEmailConfig>) =>
    onChange({ ...config, ...patch });

  const canTest =
    !!config.subject?.trim() &&
    !!config.html_body?.trim() &&
    !!config.from_email &&
    !!config.from_name?.trim();

  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testSending, setTestSending] = useState(false);

  const [copiedContent, setCopiedContent] = useState<{
    subject: string;
    html_body: string;
  } | null>(null);

  // Mirrors the reminder-email editor's sessionStorage clipboard so users can
  // copy a node's subject/body and paste into another node in the same tab.
  useEffect(() => {
    const saved = sessionStorage.getItem("workflow_email_clipboard");
    if (saved) {
      try {
        setCopiedContent(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved workflow email content", e);
      }
    }
  }, []);

  const canCopy = !!config.subject?.trim() || !!config.html_body?.trim();

  const handleCopyContent = () => {
    const content = {
      subject: config.subject || "",
      html_body: config.html_body || "",
    };
    setCopiedContent(content);
    sessionStorage.setItem(
      "workflow_email_clipboard",
      JSON.stringify(content),
    );
    toast.success("Email content copied");
  };

  const handlePasteContent = () => {
    if (!copiedContent) return;
    update({
      subject: copiedContent.subject,
      html_body: copiedContent.html_body,
    });
    toast.success("Email content pasted");
  };

  const handleSendTest = async () => {
    if (!testTo.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    try {
      setTestSending(true);
      await workflowService.sendTestEmail({
        subject: config.subject,
        // Same sanitization the save path applies, so the test send matches
        // what the engine will actually deliver once published.
        html_body: cleanHtml(config.html_body),
        from_email: config.from_email,
        from_name: config.from_name,
        to_email: testTo.trim(),
      });
      toast.success(`Test email sent to ${testTo.trim()}`);
      setTestOpen(false);
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message || "Failed to send test email"
      );
    } finally {
      setTestSending(false);
    }
  };

  return (
    <>
      <div>
        <Label htmlFor="from_email">From email</Label>
        <Select
          value={config.from_email}
          onValueChange={(v) => update({ from_email: v })}
          disabled={readOnly}
        >
          <SelectTrigger id="from_email" className="mt-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VERIFIED_SENDERS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          Only verified senders are allowed. Publishing rejects unknown values.
        </p>
      </div>

      <div>
        <Label htmlFor="from_name">From name</Label>
        <Input
          id="from_name"
          value={config.from_name || ""}
          disabled={readOnly}
          onChange={(e) => update({ from_name: e.target.value })}
          className="mt-2"
        />
      </div>

      <div>
        <Label htmlFor="subject">Subject</Label>
        <Input
          id="subject"
          value={config.subject || ""}
          disabled={readOnly}
          onChange={(e) => update({ subject: e.target.value })}
          className="mt-2"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Personalize with {`{{name}}`}, {`{{email}}`}, {`{{phone}}`}.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Email body</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCopyContent}
              disabled={readOnly || !canCopy}
              title={
                canCopy
                  ? "Copy subject and body to clipboard"
                  : "Subject or body must have content to copy"
              }
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy content
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handlePasteContent}
              disabled={readOnly || !copiedContent}
              title={
                copiedContent
                  ? "Paste copied subject and body"
                  : "Nothing copied yet"
              }
              className="border-dashed"
            >
              <ClipboardPaste className="h-3.5 w-3.5 mr-1.5" />
              Paste content
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setTestOpen(true)}
              disabled={readOnly || !canTest}
              title={
                canTest
                  ? "Send a real test message to any address"
                  : "Fill subject, body, from email & from name first"
              }
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Send test
            </Button>
          </div>
        </div>

        <EmailTextEditor3
          value={config.html_body || ""}
          onChange={readOnly ? () => {} : (val) => update({ html_body: val })}
        />

        <p className="text-xs text-muted-foreground mt-2">
          Tokens: {`{{name}}`}, {`{{email}}`}, {`{{phone}}`}.
        </p>
      </div>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send a test email</DialogTitle>
            <DialogDescription>
              We'll deliver one real email using the same sender and template
              you have configured. Subject will be prefixed with{" "}
              <code>[TEST]</code>. {`{{name}}`}, {`{{email}}`}, {`{{phone}}`}{" "}
              tokens are filled with sample values.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="test-to">Send to</Label>
            <Input
              id="test-to"
              type="email"
              placeholder="you@example.com"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTestOpen(false)}
              disabled={testSending}
            >
              Cancel
            </Button>
            <Button onClick={handleSendTest} disabled={testSending}>
              {testSending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <Send className="h-4 w-4 mr-2" />
              Send test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DelayFormFields({
  config,
  onChange,
  readOnly,
}: {
  config: DelayConfig;
  onChange: (c: DelayConfig) => void;
  readOnly: boolean;
}) {
  const update = (patch: Partial<DelayConfig>) =>
    onChange({ ...config, ...patch });

  return (
    <div className="flex gap-3 items-end">
      <div className="flex-1">
        <Label htmlFor="duration_value">Wait</Label>
        <Input
          id="duration_value"
          type="number"
          min={1}
          value={config.duration_value ?? ""}
          disabled={readOnly}
          onChange={(e) =>
            update({ duration_value: parseInt(e.target.value, 10) || 1 })
          }
          className="mt-2"
        />
      </div>
      <div className="flex-1">
        <Label htmlFor="duration_unit">Unit</Label>
        <Select
          value={config.duration_unit}
          onValueChange={(v) => update({ duration_unit: v as DurationUnit })}
          disabled={readOnly}
        >
          <SelectTrigger id="duration_unit" className="mt-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DURATION_UNITS.map((u) => (
              <SelectItem key={u.value} value={u.value}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function GoalFormFields({
  config,
  onChange,
  readOnly,
}: {
  config: GoalConfig;
  onChange: (c: GoalConfig) => void;
  readOnly: boolean;
}) {
  return (
    <div>
      <Label htmlFor="goal_name">Exit label (optional)</Label>
      <Input
        id="goal_name"
        value={config.goal_name || ""}
        disabled={readOnly}
        onChange={(e) => onChange({ goal_name: e.target.value })}
        className="mt-2"
        placeholder="e.g. demo_booked"
      />
      <p className="text-xs text-muted-foreground mt-1">
        When a lead reaches this Exit, a <code>goal.reached</code> event is
        recorded with this label. Other workflows' "If / then" steps can read
        it. Leave blank if you just want the workflow to end here.
      </p>
    </div>
  );
}

const CONDITION_EVENT_TYPES: Array<{ value: LeadEventType; label: string }> = [
  { value: "email.opened", label: "Opened an email" },
  { value: "email.clicked", label: "Clicked a link in an email" },
  { value: "email.unsubscribed", label: "Unsubscribed" },
];

function ConditionFormFields({
  config,
  onChange,
  readOnly,
}: {
  config: ConditionConfig;
  onChange: (c: ConditionConfig) => void;
  readOnly: boolean;
}) {
  const update = (patch: Partial<ConditionConfig>) =>
    onChange({ ...config, ...patch });

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="cond_event_type">If the lead</Label>
        <Select
          value={config.event_type}
          onValueChange={(v) => update({ event_type: v as LeadEventType })}
          disabled={readOnly}
        >
          <SelectTrigger id="cond_event_type" className="mt-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONDITION_EVENT_TYPES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <Label htmlFor="cond_timeout_value">…within</Label>
          <Input
            id="cond_timeout_value"
            type="number"
            min={1}
            value={config.timeout_value ?? ""}
            disabled={readOnly}
            onChange={(e) =>
              update({
                timeout_value: parseInt(e.target.value, 10) || 1,
              })
            }
            className="mt-2"
          />
        </div>
        <div className="flex-1">
          <Label htmlFor="cond_timeout_unit">Unit</Label>
          <Select
            value={config.timeout_unit}
            onValueChange={(v) =>
              update({ timeout_unit: v as DurationUnit })
            }
            disabled={readOnly}
          >
            <SelectTrigger id="cond_timeout_unit" className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATION_UNITS.map((u) => (
                <SelectItem key={u.value} value={u.value}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
        <strong>How this branches:</strong> the workflow pauses here. If the
        lead does the chosen action before the time runs out, the <strong>Yes</strong>{" "}
        branch runs. Otherwise the <strong>No</strong> branch runs. Only events
        that happen after this step starts count.
      </div>
    </div>
  );
}

