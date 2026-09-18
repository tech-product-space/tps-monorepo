"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Radio, Users } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Button } from "@/gradient/components/ui/button";

import { workflowService } from "@/gradient/services/workflowService";
import type { AudiencePreview, ValidationResult, Workflow } from "@/gradient/types/workflow";

interface Props {
  workflow: Workflow;
  validation: ValidationResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  publishing: boolean;
}

/**
 * Publish, with the consequence stated.
 *
 * The number is the whole point. "Publish?" invites a click; "this will start
 * enrolling people, and 3,480 match right now" invites a decision — and it is
 * the one moment before a workflow starts mailing on its own, unattended, for
 * as long as it is live.
 *
 * When validation fails this becomes the checklist instead. Every error at
 * once, because fixing them one round trip at a time is how a five-minute job
 * becomes twenty.
 */
export default function PublishDialog({
  workflow,
  validation,
  open,
  onOpenChange,
  onConfirm,
  publishing,
}: Props) {
  const [audience, setAudience] = useState<AudiencePreview | null>(null);
  const [loadingAudience, setLoadingAudience] = useState(false);

  const isStaticList = workflow.triggerType === "staticList";

  useEffect(() => {
    if (!open || !isStaticList || !validation.valid) return;

    let cancelled = false;

    // Inside an async call rather than at the top of the effect: a setState in
    // the effect body runs synchronously and triggers a second render before
    // the first has painted.
    const load = async () => {
      setLoadingAudience(true);

      try {
        const result = await workflowService.audience(workflow.id);
        if (!cancelled) setAudience(result);
      } catch {
        // Silent. A failed count must not block a publish that is otherwise
        // valid — the dialog just says nothing about numbers.
      } finally {
        if (!cancelled) setLoadingAudience(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [open, isStaticList, validation.valid, workflow.id]);

  const republish = Boolean(workflow.currentVersion);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {validation.valid
              ? republish
                ? `Publish version ${(workflow.currentVersion ?? 0) + 1}?`
                : "Make this automation live?"
              : "Not ready yet"}
          </DialogTitle>
        </DialogHeader>

        {!validation.valid ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Fix these first:
            </p>
            <ul className="space-y-1.5">
              {validation.errors.map((error) => (
                <li key={error} className="flex items-start gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>{error}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            {workflow.triggerType === "newActivity" ? (
              <div className="flex items-start gap-2.5">
                <Radio className="h-4 w-4 mt-0.5 shrink-0 text-sky-600" />
                <p>
                  From now on, everyone who matches the trigger is enrolled
                  automatically and starts receiving these emails. Nobody
                  existing is enrolled.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2.5">
                <Users className="h-4 w-4 mt-0.5 shrink-0 text-violet-600" />
                <div>
                  <p>
                    Publishing does not send anything on its own — you start it
                    with <strong>Run</strong>.
                  </p>
                  {loadingAudience ? (
                    <p className="mt-1.5 flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Counting the audience…
                    </p>
                  ) : audience ? (
                    <p className="mt-1.5 text-muted-foreground">
                      <strong className="text-foreground">
                        {audience.total.toLocaleString()}
                      </strong>{" "}
                      people match right now.
                    </p>
                  ) : null}
                </div>
              </div>
            )}

            {republish && (
              // The part nobody expects, so it is stated rather than implied.
              <p className="rounded-md bg-muted/50 px-3 py-2 text-muted-foreground">
                Anyone part-way through version {workflow.currentVersion} keeps
                walking that version to the end. Only people enrolled after this
                get the new one.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {validation.valid ? "Cancel" : "Back to editing"}
          </Button>
          {validation.valid && (
            <Button onClick={onConfirm} disabled={publishing}>
              {publishing && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {republish ? "Publish new version" : "Publish"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
