"use client";

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/gradient/components/ui/sheet";
import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import EmailEditor from "@/gradient/components/ui/EmailEditor/EmailEditor";

import { workflowService } from "@/gradient/services/workflowService";
import { campaignService } from "@/gradient/services/campaignService";
import type { CampaignSender } from "@/gradient/types/campaign";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import type {
  BranchConfig,
  ConditionOption,
  DurationUnit,
  NodeConfig,
  SendEmailConfig,
  WaitConfig,
  WorkflowNode,
} from "@/gradient/types/workflow";
import { DURATION_UNIT_LABELS, NODE_LABELS } from "@/gradient/types/workflow";

interface Props {
  workflowId: string;
  node: WorkflowNode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: NodeConfig) => void;
  readOnly?: boolean;
}

const UNITS: DurationUnit[] = ["minutes", "hours", "days", "weeks"];

/** A line of orientation under the panel title. */
const SHEET_HINTS: Record<string, string> = {
  sendEmail: "What this person receives at this point in the journey.",
  wait: "How long to pause before the next step.",
  branch: "Ask whether they have done something, and take a different path.",
  exit: "Ends the journey here. Name it after what reaching this point means.",
};

/**
 * Configures one step, in a panel from the right.
 *
 * A panel rather than a centre-screen dialog, and the canvas is the reason: a
 * modal in the middle covers the thing you are editing, so every check of
 * "which step was this again" costs a close and a reopen. Sliding in from the
 * side leaves the flow visible beside it — which is how TPS does it too.
 *
 * Everything is local until Save, so backing out changes nothing — the same
 * contract the audience selector makes, and the reason neither needs an
 * "are you sure" on cancel.
 */
export default function StepConfigSheet({
  workflowId,
  node,
  open,
  onOpenChange,
  onSave,
  readOnly = false,
}: Props) {
  const [config, setConfig] = useState<NodeConfig>({});
  const [testTo, setTestTo] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [conditions, setConditions] = useState<ConditionOption[]>([]);
  const [senders, setSenders] = useState<CampaignSender[]>([]);

  // Re-seeded on every open: local edits from a cancelled session must not
  // survive into the next one.
  useEffect(() => {
    if (open && node) setConfig({ ...node.config });
  }, [open, node]);

  /**
   * The verified senders, from the same endpoint campaigns and reminders use.
   *
   * Typed freely before, which is how a workflow ends up pointing at an address
   * SES has never been asked to verify — and the failure surfaces days later,
   * on step three of somebody's journey, as a provider error nobody is
   * watching for. The list is short and it is the list that actually works.
   */
  useEffect(() => {
    if (!open || node?.type !== "sendEmail" || senders.length) return;

    campaignService
      .senders()
      .then(setSenders)
      .catch(() => toast.error("Could not load the sender addresses"));
  }, [open, node?.type, senders.length]);

  /**
   * The list of questions comes from the backend, not from a constant here.
   *
   * It is derived from what the product actually records, so an event with no
   * emitter can never be offered — which is the whole reason a branch on
   * "did they open it" is impossible to build by accident.
   */
  useEffect(() => {
    if (!open || node?.type !== "branch" || conditions.length) return;

    workflowService
      .conditions()
      .then(setConditions)
      .catch(() => toast.error("Could not load the list of conditions"));
  }, [open, node?.type, conditions.length]);

  if (!node) return null;

  const patch = (updates: Record<string, unknown>) =>
    setConfig((prev) => ({ ...prev, ...updates }));

  const email = config as SendEmailConfig;
  const wait = config as WaitConfig;
  const branch = config as BranchConfig;

  const handleSendTest = async () => {
    if (!testTo.trim()) return;

    setSendingTest(true);
    try {
      await workflowService.sendTest(workflowId, testTo.trim(), email);
      // Says where it went. "Test sent" alone is useless when you have three
      // addresses and cannot remember which one you typed.
      toast.success(`Test sent to ${testTo.trim()}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not send the test"));
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Wide enough for the email editor to be usable, capped so the canvas
          behind it is never fully hidden. */}
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-[640px]"
      >
        <SheetHeader className="border-b">
          <SheetTitle>{NODE_LABELS[node.type]}</SheetTitle>
          <SheetDescription>{SHEET_HINTS[node.type]}</SheetDescription>
        </SheetHeader>

        {/* The body scrolls; the header and the footer do not, so Save is
            always reachable however long the email body gets. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">

        {node.type === "sendEmail" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="senderEmail">From</Label>
                <Select
                  value={email.senderEmail || ""}
                  onValueChange={(senderEmail) => patch({ senderEmail })}
                  disabled={readOnly || !senders.length}
                >
                  <SelectTrigger id="senderEmail" className="mt-1.5 w-full">
                    <SelectValue placeholder="Choose a verified sender" />
                  </SelectTrigger>
                  <SelectContent>
                    {senders.map((sender) => (
                      <SelectItem key={sender.email} value={sender.email}>
                        {sender.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* A stored address that is no longer on the list would show as
                    an empty box, which reads as "nothing chosen" rather than
                    "this one has gone". Say which. */}
                {email.senderEmail &&
                  senders.length > 0 &&
                  !senders.some((sender) => sender.email === email.senderEmail) && (
                    <p className="mt-1 text-xs text-amber-700">
                      {email.senderEmail} is no longer a verified sender. Pick
                      another.
                    </p>
                  )}
              </div>
              <div>
                <Label htmlFor="senderName">Sender name</Label>
                <Input
                  id="senderName"
                  value={email.senderName || ""}
                  onChange={(e) => patch({ senderName: e.target.value })}
                  placeholder="The Gradient"
                  disabled={readOnly}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={email.subject || ""}
                onChange={(e) => patch({ subject: e.target.value })}
                disabled={readOnly}
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Personalise with {"{{name}}"} — it becomes their first name, or
                &ldquo;there&rdquo; when we do not have one.
              </p>
            </div>

            <div>
              <Label>Body</Label>
              <div className="mt-1.5">
                <EmailEditor
                  value={email.body || ""}
                  onChange={(body) => patch({ body })}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                An unsubscribe footer is added automatically — every automation
                email carries one.
              </p>
            </div>

            {!readOnly && (
              <div className="rounded-md border bg-muted/30 p-3">
                <Label className="text-xs">Send yourself a test</Label>
                <div className="flex gap-2 mt-1.5">
                  <Input
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    placeholder="you@thegradient.co.in"
                    className="h-9"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={handleSendTest}
                    disabled={!testTo.trim() || sendingTest}
                  >
                    {sendingTest ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {/* The test goes through the identical compose path, so this is
                    a promise the code actually keeps. */}
                <p className="text-xs text-muted-foreground mt-1.5">
                  Arrives marked [TEST], and is otherwise exactly what recipients
                  get.
                </p>
              </div>
            )}
          </div>
        )}

        {node.type === "wait" && (
          <div className="space-y-3">
            <Label>Wait for</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={wait.value ?? 1}
                onChange={(e) => patch({ value: Number(e.target.value) })}
                disabled={readOnly}
                className="w-28"
              />
              <Select
                value={wait.unit || "days"}
                onValueChange={(unit) => patch({ unit })}
                disabled={readOnly}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {DURATION_UNIT_LABELS[unit]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Counted from the moment the previous step finished, per person.
            </p>
          </div>
        )}

        {node.type === "branch" && (
          <div className="space-y-4">
            <div>
              <Label>Ask whether they have</Label>
              <Select
                value={branch.eventType || ""}
                onValueChange={(eventType) => patch({ eventType })}
                disabled={readOnly || !conditions.length}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Choose something they might do" />
                </SelectTrigger>
                <SelectContent>
                  {conditions.map((option) => (
                    <SelectItem key={option.eventType} value={option.eventType}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Said plainly, because the obvious thing to reach for is
                  "did they open it" and that is deliberately not on the list. */}
              <p className="text-xs text-muted-foreground mt-1">
                These are things the product records. Email opens are not
                tracked, so they cannot be branched on.
              </p>
            </div>

            <div>
              <Label>Counting from</Label>
              <Select
                value={branch.since || "previousStep"}
                onValueChange={(since) => patch({ since })}
                disabled={readOnly}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="previousStep">
                    The step before this one
                  </SelectItem>
                  <SelectItem value="enrollmentStart">
                    When they entered the workflow
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Give them</Label>
              <div className="flex gap-2 mt-1.5">
                <Input
                  type="number"
                  min={1}
                  value={branch.timeoutValue ?? 5}
                  onChange={(e) =>
                    patch({ timeoutValue: Number(e.target.value) })
                  }
                  disabled={readOnly}
                  className="w-28"
                />
                <Select
                  value={branch.timeoutUnit || "days"}
                  onValueChange={(timeoutUnit) => patch({ timeoutUnit })}
                  disabled={readOnly}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {DURATION_UNIT_LABELS[unit]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="font-medium">What happens</div>
              <ul className="mt-1.5 space-y-1 text-muted-foreground">
                <li>
                  <span className="font-medium text-green-700">yes</span> — as
                  soon as they do it, even on the first day.
                </li>
                <li>
                  <span className="font-medium">no</span> — once the window
                  closes without it.
                </li>
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Both paths need connecting on the canvas, or this cannot be
                published — otherwise everyone who did not do it would silently
                fall off the end.
              </p>
            </div>
          </div>
        )}

        {node.type === "exit" && (
          <div className="space-y-3">
            <Label htmlFor="reason">Label</Label>
            <Input
              id="reason"
              value={(config as { reason?: string }).reason || ""}
              onChange={(e) => patch({ reason: e.target.value })}
              placeholder="completed"
              disabled={readOnly}
              className="mt-1.5"
            />
            <p className="text-xs text-muted-foreground">
              Shown in reporting, so name it after what reaching here means —
              &ldquo;finished the sequence&rdquo;, &ldquo;booked a call&rdquo;.
            </p>
          </div>
        )}

        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {!readOnly && (
            <Button
              onClick={() => {
                onSave(config);
                onOpenChange(false);
              }}
            >
              Save step
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
