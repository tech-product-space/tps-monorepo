"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  Lock,
  Moon,
  Pause,
  Play,
  Rocket,
  Send,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { isAxiosError } from "axios";

import { Button } from "@/gradient/components/ui/button";
import { Badge } from "@/gradient/components/ui/badge";
import { Input } from "@/gradient/components/ui/input";
import { Textarea } from "@/gradient/components/ui/textarea";
import { Label } from "@/gradient/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/gradient/components/ui/alert-dialog";

import { workflowService } from "@/gradient/services/workflowService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import type {
  TriggerConfig,
  ValidationResult,
  Workflow,
  WorkflowDefinition,
  WorkflowDetail,
  WorkflowTriggerType,
} from "@/gradient/types/workflow";
import {
  WORKFLOW_STATUS_LABELS,
  WORKFLOW_STATUS_STYLES,
} from "@/gradient/types/workflow";

import StepsTab from "./StepsTab";
import WorkflowCanvas from "./Canvas/WorkflowCanvas";
import TriggerTab from "./TriggerTab";
import PublishDialog from "./PublishDialog";
import ReadinessStepper from "./ReadinessStepper";
import EnrollmentsPanel from "./EnrollmentsPanel";
import ReportTab from "./ReportTab";
import ActivityTimeline from "@/gradient/components/Common/ActivityTimeline/ActivityTimeline";
import { hasUnpublishedChanges, orderedNodes } from "./stepHelpers";

type Tab =
  "trigger" | "steps" | "report" | "settings" | "enrollments" | "history";

/**
 * Trigger first, and it is not cosmetic.
 *
 * The trigger is *who enters*, and the steps are what they get — writing the
 * emails before knowing who receives them is the wrong way round, and the
 * readiness stepper above has always said so ("Pick a trigger", then "Add the
 * steps"). Opening on Steps contradicted it.
 */
const TABS: { id: Tab; label: string }[] = [
  { id: "trigger", label: "Trigger" },
  { id: "steps", label: "Steps" },
  { id: "report", label: "Report" },
  { id: "settings", label: "Settings" },
  { id: "enrollments", label: "Enrolments" },
  { id: "history", label: "History" },
];

/** Narrows an arbitrary query-string value to a tab we actually have. */
const isTab = (value: string | null): value is Tab =>
  TABS.some((t) => t.id === value);

/**
 * The automation editor.
 *
 * **A live workflow stays editable.** Edits go to the draft; the published
 * version is frozen, so the people already walking it finish the journey they
 * started. Locking the editor on publish is what fills a panel with
 * `Nurture v2 (copy)`.
 */
export default function AutomationEditor({ id }: { id: string }) {
  const router = useRouter();

  const [detail, setDetail] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * The open tab lives in the URL, not in state.
   *
   * Refreshing while looking at the Steps canvas used to drop you back on
   * Trigger, which is a small thing that happens constantly — the editor is a
   * page people reload. Deriving it from the query string rather than mirroring
   * it into state means there is one source of truth, back and forward work,
   * and the link is shareable.
   *
   * `replace`, not `push`: flipping between tabs should not fill up the back
   * button on the way to leaving the page.
   */
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const tabParam = searchParams.get("tab");
  const tab: Tab = isTab(tabParam) ? tabParam : "trigger";

  const setTab = (next: Tab) =>
    router.replace(`${pathname}?tab=${next}`, { scroll: false });

  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  /**
   * Pause and Resume only.
   *
   * Run used to share this flag, which meant pressing Run greyed out Pause —
   * precisely when you might want it, since a Run against a few thousand people
   * is the one action worth being able to stop half way.
   */
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);

  /**
   * Canvas or list.
   *
   * **The canvas is the default.** It shows the trigger, so the screen reads
   * the way the journey actually runs — somebody enters, then things happen to
   * them — and it is the only view that can draw a branch. The list survives as
   * the quicker way to reorder a long straight sequence.
   */
  const [view, setView] = useState<"list" | "canvas" | null>(null);

  /**
   * The canvas has its own theme, remembered per browser.
   *
   * Scoped to the canvas rather than the panel: a flow diagram is a dense field
   * of coloured cards and lines, and plenty of people who want the rest of the
   * admin light want that dark. Nothing outside the canvas wrapper changes.
   */
  const [canvasTheme, setCanvasTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem("workflow_canvas_theme");
    if (stored === "dark" || stored === "light") setCanvasTheme(stored);
  }, []);

  const toggleCanvasTheme = () =>
    setCanvasTheme((current) => {
      const next = current === "light" ? "dark" : "light";

      try {
        window.localStorage.setItem("workflow_canvas_theme", next);
      } catch {
        // Private mode, quota — a lost preference is not worth a broken toggle.
      }

      return next;
    });

  const [savedAt, setSavedAt] = useState<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await workflowService.get(id));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load the automation"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Is a Run still going?
   *
   * Run **queues** the enrolling and returns "started" — nothing on the
   * workflow row says whether that work has finished, so the queue is asked
   * directly. Two things depend on the answer: Run is replaced by a "Running…"
   * indicator rather than left sitting there pressable, and the readiness
   * checklist waits to tick "Run it" until somebody has actually been enrolled.
   *
   * Polled only while a run is in flight — a single request on open, and then
   * nothing at all for the ninety-nine percent of the time nothing is running.
   */
  /**
   * Set optimistically the moment Run is accepted, not when the first poll
   * comes back. Waiting for the poll left a second or two in which the run was
   * under way and the button was still sitting there, pressable — which is
   * exactly when somebody presses it again.
   */
  const [running, setRunning] = useState(false);
  const [runNonce, setRunNonce] = useState(0);
  const wasRunning = useRef(false);

  const isStaticList = detail?.workflow.triggerType === "staticList";
  const isActive = detail?.workflow.status === "active";

  useEffect(() => {
    if (!isStaticList || !isActive) {
      // Pausing mid-run stops the polling, and a stale `running` left behind
      // would leave "Enrolling…" showing over a workflow that has stopped.
      setRunning(false);
      wasRunning.current = false;
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const status = await workflowService.runStatus(id);
        if (cancelled) return;

        setRunning(status.running);

        // The moment the queue drains, everything counted on this page is one
        // fetch out of date — the enrolments the run created were made after
        // the last read.
        if (wasRunning.current && !status.running) load();
        wasRunning.current = status.running;

        if (status.running) timer = setTimeout(poll, 2000);
      } catch {
        // Silent. Redis being unreachable is what the health banner is for,
        // and a failing poll must not become a toast every two seconds.
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, isStaticList, isActive, load, runNonce]);

  // Clear any pending autosave on unmount, so a debounce that outlives the
  // page cannot fire against a stale draft.
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!detail) return null;

  const { workflow, validation } = detail;
  const readOnly = workflow.status === "archived";
  const nodes = orderedNodes(workflow.definition);

  /**
   * A workflow that branches cannot be edited as a list.
   *
   * Two labelled paths rendered as a flat sequence is a puzzle, so the canvas
   * is forced rather than merely preferred — and the List button says why it is
   * disabled instead of silently doing nothing.
   */
  const branches = nodes.some((n) => n.type === "branch");

  /**
   * "Publish changes" used to be permanent.
   *
   * The label was driven by `currentVersion` being set, which only says that
   * *something* was published — never whether anything has changed since. So a
   * workflow published once and never touched again advertised outstanding work
   * forever, and the button next to it stayed lit for a publish that would have
   * produced a byte-identical version 4.
   */
  const unpublished = hasUnpublishedChanges(workflow, detail.activeVersion);
  const nothingToPublish = Boolean(workflow.currentVersion) && !unpublished;

  /**
   * The trigger freezes at the first publish.
   *
   * The steps are what a workflow does; the trigger is what it *is*. Republishing
   * with a different audience does not amend the automation, it quietly
   * repurposes it — the name, the report and the enrolment list all carry on
   * describing the workflow it used to be.
   */
  const triggerLocked = Boolean(workflow.currentVersion);
  const effectiveView = branches ? "canvas" : (view ?? "canvas");

  /**
   * Debounced autosave.
   *
   * The editor has no Save button by design: an automation is edited in a dozen
   * small moves — reorder, retitle, tweak a wait — and a form that must be
   * submitted turns each of them into a decision. Publishing is the deliberate
   * act; saving the draft is not.
   */
  const save = (
    updates: Partial<{
      name: string;
      description: string | null;
      definition: WorkflowDefinition;
      triggerType: WorkflowTriggerType;
      triggerConfig: TriggerConfig;
    }>,
    { immediate = false } = {},
  ) => {
    setDetail((prev) =>
      prev
        ? { ...prev, workflow: { ...prev.workflow, ...updates } as Workflow }
        : prev,
    );

    if (saveTimer.current) clearTimeout(saveTimer.current);

    const run = async () => {
      try {
        const res = await workflowService.update(id, updates);
        setSavedAt(Date.now());
        // The API returns fresh validation with every write, so the publish
        // button and the stepper stay honest without a second request.
        setDetail((prev) =>
          prev
            ? { ...prev, validation: res.validation as ValidationResult }
            : prev,
        );
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Could not save"));
        load();
      }
    };

    if (immediate) run();
    else saveTimer.current = setTimeout(run, 700);
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const result = await workflowService.publish(id);
      toast.success(`Live — version ${result.version}`);
      setPublishOpen(false);
      load();
    } catch (error) {
      // A 422 carries the checklist; the dialog is already showing it, so a
      // toast on top would be the same information twice.
      if (isAxiosError(error) && error.response?.status === 422) {
        const errors = (error.response.data as { errors?: string[] })?.errors;
        if (errors) {
          setDetail((prev) =>
            prev ? { ...prev, validation: { valid: false, errors } } : prev,
          );
        }
      } else {
        toast.error(getApiErrorMessage(error, "Could not publish"));
      }
    } finally {
      setPublishing(false);
    }
  };

  /**
   * Kept out of `act` so it does not touch `busy`, and so it does not refetch
   * on the way out: at the instant the POST returns the job has usually not
   * been picked up yet, so a reload here reads the same numbers back. The poll
   * reloads when the run actually ends.
   */
  const startRun = async () => {
    setStarting(true);
    // Before the request, not after it. The job is queued the instant the API
    // accepts it, so anything less than immediate leaves a pressable Run button
    // over a run that has already begun.
    setRunning(true);
    wasRunning.current = true;

    try {
      await workflowService.run(id);
      toast.success("Started. Enrolments will appear shortly.");
      setRunNonce((n) => n + 1);
    } catch (error) {
      // Nothing was queued, so put the button back rather than leaving a
      // permanent "Enrolling…" over a run that never started.
      setRunning(false);
      wasRunning.current = false;
      toast.error(getApiErrorMessage(error, "Could not run"));
    } finally {
      setStarting(false);
    }
  };

  const act = async (
    fn: () => Promise<unknown>,
    message: string,
    fallback: string,
  ) => {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, fallback));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/marketing/automations")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{workflow.name}</h2>
              <Badge
                variant="outline"
                className={`font-medium ${WORKFLOW_STATUS_STYLES[workflow.status]}`}
              >
                {WORKFLOW_STATUS_LABELS[workflow.status]}
              </Badge>
              {workflow.currentVersion && (
                <span className="text-xs text-muted-foreground">
                  v{workflow.currentVersion}
                </span>
              )}
            </div>
            {savedAt && (
              <span className="text-xs text-muted-foreground">Saved</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {workflow.status === "active" && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                act(
                  () => workflowService.pause(id),
                  "Paused. Nobody new will be enrolled.",
                  "Failed to pause",
                )
              }
            >
              <Pause className="h-4 w-4 mr-1.5" />
              Pause
            </Button>
          )}

          {workflow.status === "paused" && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                act(
                  () => workflowService.resume(id),
                  "Resumed",
                  "Failed to resume",
                )
              }
            >
              <Play className="h-4 w-4 mr-1.5" />
              Resume
            </Button>
          )}

          {/* While a run is working, Run is not a greyed-out button — it is
              replaced by what is actually happening, and Pause beside it stays
              live, because stopping a run half way is the whole reason anybody
              looks at this header during one. */}
          {running && (
            <div className="flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-900">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Enrolling…
            </div>
          )}

          {!running &&
            workflow.status === "active" &&
            workflow.triggerType === "staticList" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={starting}>
                    <Send className="h-4 w-4 mr-1.5" />
                    Run
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Run this automation?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Everyone in the audience who is not already in a workflow
                      will be enrolled and start receiving these emails. This
                      cannot be undone, though you can pause it afterwards.
                      {detail.stats.active + detail.stats.waiting > 0 && (
                        <>
                          {" "}
                          The{" "}
                          {(
                            detail.stats.active + detail.stats.waiting
                          ).toLocaleString()}{" "}
                          already part-way through will be skipped, not enrolled
                          again.
                        </>
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={startRun}>
                      Run
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

          {!readOnly && (
            <Button
              size="sm"
              variant={nothingToPublish ? "outline" : "default"}
              // The API decides whether it is publishable — `validation` comes
              // back with every save, so this is never stale by more than one
              // keystroke. Whether there is anything *to* publish is decided
              // here, against the version that is actually live.
              disabled={!validation.valid || nothingToPublish}
              title={
                nothingToPublish
                  ? `Version ${workflow.currentVersion} is live and the draft matches it — there is nothing to publish.`
                  : validation.valid
                    ? undefined
                    : `Not ready: ${validation.errors.length} thing${
                        validation.errors.length === 1 ? "" : "s"
                      } left to fix`
              }
              onClick={() => setPublishOpen(true)}
            >
              <Rocket className="h-4 w-4 mr-1.5" />
              {!workflow.currentVersion
                ? "Publish"
                : unpublished
                  ? "Publish changes"
                  : "Published"}
            </Button>
          )}
        </div>
      </div>

      <ReadinessStepper
        workflow={workflow}
        stats={detail.stats}
        running={running}
      />

      {/* With Publish disabled the dialog can no longer be opened to find out
          why, so the checklist moves out here. Every error at once — fixing
          them one round trip at a time is how a five-minute job becomes
          twenty. */}
      {!readOnly && !validation.valid && validation.errors.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <AlertCircle className="h-4 w-4" />
            Not ready to publish
          </div>
          <ul className="mt-1.5 space-y-1">
            {validation.errors.map((error) => (
              <li
                key={error}
                className="flex items-start gap-2 text-sm text-amber-900/90"
              >
                <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-600" />
                <span>{error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Stated once, near the publish button, rather than as a modal or a
          lock — see the note on this component. */}
      {workflow.currentVersion ? (
        <p className="text-xs text-muted-foreground">
          {unpublished
            ? `Version ${workflow.currentVersion} is live. Your edits are saved to the draft and stay off it until you publish.`
            : `Version ${workflow.currentVersion} is live, and the draft matches it.`}
          {detail.stats.active || detail.stats.waiting
            ? ` ${(detail.stats.active + detail.stats.waiting).toLocaleString()} people are part-way through it and will finish it.`
            : ""}
        </p>
      ) : null}

      {/* ── tabs ── */}
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.id === "enrollments" && detail.stats.active > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">
                {detail.stats.active}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="pt-1">
        {tab === "steps" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {readOnly
                  ? "This automation is archived and read-only."
                  : "Click a step to edit it. Use the + on any arrow to add the next one. Drag steps to rearrange."}
              </p>

              <div className="flex items-center gap-1">
                {effectiveView === "canvas" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={toggleCanvasTheme}
                    title={
                      canvasTheme === "dark"
                        ? "Switch the canvas to light"
                        : "Switch the canvas to dark"
                    }
                    aria-label="Toggle canvas theme"
                  >
                    {canvasTheme === "dark" ? (
                      <Sun className="h-4 w-4" />
                    ) : (
                      <Moon className="h-4 w-4" />
                    )}
                  </Button>
                )}
                {(["canvas", "list"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    disabled={v === "list" && branches}
                    title={
                      v === "list" && branches
                        ? "This workflow branches — a flat list cannot show two paths"
                        : undefined
                    }
                    className={`rounded px-2 py-1 text-xs font-medium transition disabled:opacity-40 ${
                      effectiveView === v
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v === "list" ? "List" : "Canvas"}
                  </button>
                ))}
              </div>
            </div>
            {effectiveView === "canvas" ? (
              <WorkflowCanvas
                workflow={workflow}
                definition={workflow.definition}
                onChange={(definition) => save({ definition })}
                onSwitchToTrigger={() => setTab("trigger")}
                readOnly={readOnly}
                theme={canvasTheme}
              />
            ) : (
              <StepsTab
                workflowId={id}
                definition={workflow.definition}
                onChange={(definition) => save({ definition })}
                readOnly={readOnly}
              />
            )}
          </div>
        )}

        {tab === "trigger" && (
          <div className="space-y-3">
            {/* Stated above the controls rather than discovered by clicking a
                disabled one. The backend refuses the change too — this is the
                explanation, not the enforcement. */}
            {triggerLocked && (
              <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-4 py-3 text-sm">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium">The trigger is fixed</p>
                  <p className="mt-0.5 text-muted-foreground">
                    It was set when version 1 went live. The steps can still be
                    edited and published — the audience cannot, because the same
                    steps sent to different people is a different automation.
                    Duplicate this one to build that.
                  </p>
                </div>
              </div>
            )}
            <TriggerTab
              workflow={workflow}
              onChange={(updates) => save(updates, { immediate: true })}
              readOnly={readOnly || triggerLocked}
            />
          </div>
        )}

        {tab === "report" && <ReportTab workflowId={id} />}

        {tab === "settings" && (
          <div className="max-w-xl space-y-4">
            <div>
              <Label htmlFor="wf-name">Name</Label>
              <Input
                id="wf-name"
                value={workflow.name}
                onChange={(e) => save({ name: e.target.value })}
                disabled={readOnly}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="wf-desc">Description</Label>
              <Textarea
                id="wf-desc"
                value={workflow.description ?? ""}
                onChange={(e) => save({ description: e.target.value || null })}
                rows={3}
                disabled={readOnly}
                className="mt-1.5"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Both are internal — recipients never see either.
              </p>
            </div>
          </div>
        )}

        {tab === "enrollments" && <EnrollmentsPanel workflowId={id} />}

        {/* One line, and the payoff for the backend registry work. Publishing
            an automation is the most consequential thing anybody does in this
            panel, so "who put this live, and when" belongs on the page. */}
        {tab === "history" && (
          <ActivityTimeline entityType="workflow" entityId={id} />
        )}
      </div>

      <PublishDialog
        workflow={workflow}
        validation={validation}
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onConfirm={handlePublish}
        publishing={publishing}
      />
    </div>
  );
}
