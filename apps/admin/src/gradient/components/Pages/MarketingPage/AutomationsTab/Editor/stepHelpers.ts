import type {
  BranchConfig,
  DurationUnit,
  NodeConfig,
  SendEmailConfig,
  WaitConfig,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowNodeType,
} from "@/gradient/types/workflow";

/**
 * The linear editor's model.
 *
 * Phase 4 edits a **sequence**, and the backend stores a **graph**. These
 * helpers are the translation, and keeping them in one file is what stops the
 * canvas in phase 5 from having to unpick assumptions scattered through the UI.
 *
 * The rule: nodes are ordered by following edges from the entry node, and edges
 * are rebuilt from the order on every change. A workflow authored here always
 * has exactly one path through it.
 */

export const newNodeId = () =>
  `n_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

/** Sensible starting config, so a new step is never invalid for a silly reason. */
export const defaultConfig = (type: WorkflowNodeType): NodeConfig => {
  switch (type) {
    case "sendEmail":
      return {
        subject: "",
        body: "",
        // Deliberately blank. The sender is chosen from the verified list in
        // the step panel, and defaulting to one of them would let an email go
        // out from an address nobody picked.
        senderEmail: "",
        senderName: "The Gradient",
      } satisfies SendEmailConfig;

    case "wait":
      return { value: 3, unit: "days" } satisfies WaitConfig;

    case "branch":
      return {
        // The most useful question the product can answer, as a starting point.
        eventType: "event.registered",
        // Anchored on the previous step, because "did they register in the five
        // days after we emailed them" is what people actually mean. Anchoring
        // on enrolment would count the days before the email went out.
        since: "previousStep",
        timeoutValue: 5,
        timeoutUnit: "days",
      } satisfies BranchConfig;

    case "exit":
      return { reason: "completed" };

    default:
      return {};
  }
};

/**
 * Nodes in the order a person walks them.
 *
 * Follows edges rather than trusting array order: a workflow created by an
 * earlier version, or one that will be created by the canvas, may have its
 * nodes stored in any order at all. Falls back to array order when the graph
 * cannot be walked, so a malformed definition still renders something editable
 * rather than an empty screen.
 */
export const orderedNodes = (definition: WorkflowDefinition): WorkflowNode[] => {
  const nodes = definition?.nodes ?? [];
  const edges = definition?.edges ?? [];

  if (!nodes.length) return [];

  const byId = new Map(nodes.map((n) => [n.id, n]));

  const hasIncoming = new Set(edges.map((e) => e.to));
  const entry =
    (definition.entryNodeId && byId.get(definition.entryNodeId)) ||
    nodes.find((n) => !hasIncoming.has(n.id));

  if (!entry) return nodes;

  const next = new Map(edges.filter((e) => !e.label).map((e) => [e.from, e.to]));

  const walked: WorkflowNode[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = entry.id;

  while (cursor && !seen.has(cursor)) {
    const node = byId.get(cursor);
    if (!node) break;

    walked.push(node);
    seen.add(cursor);
    cursor = next.get(cursor);
  }

  // Anything the walk missed — a branch left over from the canvas, or an
  // orphan — is appended rather than dropped. Silently losing a step from the
  // editor would silently delete it on the next save.
  for (const node of nodes) {
    if (!seen.has(node.id)) walked.push(node);
  }

  return walked;
};

/** Rebuilds a straight-line definition from an ordered list. */
export const definitionFromOrder = (nodes: WorkflowNode[]): WorkflowDefinition => ({
  nodes: nodes.map((node, i) => ({
    ...node,
    // Positions are written even though nothing draws them yet, so the phase-5
    // canvas opens an existing workflow at a sane layout instead of guessing.
    position: node.position ?? { x: 0, y: i * 140 },
  })),
  edges: nodes
    .slice(0, -1)
    .map((node, i) => ({ from: node.id, to: nodes[i + 1].id })),
  entryNodeId: nodes[0]?.id ?? null,
});

/* ── one-line summaries for the step cards ──────────────────────────────── */

/**
 * The condition, phrased as a question.
 *
 * A local copy of the wording for the card summary only — the *list* of what
 * can be asked comes from `GET /admin/conditions`, so an event the product does
 * not record can never be offered. An unmapped key falls through to the raw
 * value rather than breaking the card.
 */
export const CONDITION_QUESTIONS: Record<string, string> = {
  "lead.created": "Submitted a form",
  "event.registered": "Registered for an event",
  "event.feedbackSubmitted": "Submitted feedback",
  "resource.downloaded": "Downloaded a resource",
  "freeCourse.enrolled": "Started a free course",
  "freeCourse.lessonCompleted": "Completed a lesson",
  "freeCourse.completed": "Finished a free course",
  "certificate.issued": "Earned a certificate",
  "subscriber.unsubscribed": "Unsubscribed",
};

const UNIT_SINGULAR: Record<DurationUnit, string> = {
  minutes: "minute",
  hours: "hour",
  days: "day",
  weeks: "week",
};

export const describeStep = (node: WorkflowNode): string => {
  switch (node.type) {
    case "sendEmail": {
      const config = node.config as SendEmailConfig;
      return config.subject?.trim() || "No subject yet";
    }

    case "wait": {
      const config = node.config as WaitConfig;
      const value = Number(config.value) || 0;
      const unit = UNIT_SINGULAR[config.unit] ?? config.unit;
      return `${value} ${unit}${value === 1 ? "" : "s"}`;
    }

    case "branch": {
      const config = node.config as BranchConfig;
      const value = Number(config.timeoutValue) || 0;
      const unit = UNIT_SINGULAR[config.timeoutUnit] ?? config.timeoutUnit;

      // The question, not the event key. "Did they event.registered" is not
      // something to put on a card.
      return `${CONDITION_QUESTIONS[config.eventType] ?? config.eventType} within ${value} ${unit}${value === 1 ? "" : "s"}?`;
    }

    case "exit":
      return (node.config as { reason?: string }).reason || "completed";

    default:
      return "";
  }
};

/**
 * Is this step configured enough to publish?
 *
 * Deliberately a **subset** of the backend validator, not a copy of it: this
 * only powers the amber dot on a card, and the API's `validation` result is
 * what the publish dialog shows. Two full implementations would eventually
 * disagree, and the one the admin sees would be the wrong one.
 */
export const isStepIncomplete = (node: WorkflowNode): boolean => {
  if (node.type === "sendEmail") {
    const config = node.config as SendEmailConfig;
    return !config.subject?.trim() || !config.body?.trim() || !config.senderEmail?.trim();
  }

  if (node.type === "wait") {
    const config = node.config as WaitConfig;
    return !Number(config.value) || Number(config.value) < 1;
  }

  if (node.type === "branch") {
    const config = node.config as BranchConfig;
    return !config.eventType || !Number(config.timeoutValue);
  }

  return false;
};

/* ── stage readiness ─────────────────────────────────────────────────────── */

/**
 * Is the trigger actually usable, or merely chosen?
 *
 * `triggerType` being set is not the same as the trigger being finished — a
 * realtime trigger watching nothing and a list trigger with an empty audience
 * both enrol precisely nobody, and both used to show a green tick. A checklist
 * that goes green before the work is done is worse than no checklist: it sends
 * people to Publish to find out.
 */
export const isTriggerComplete = (workflow: {
  triggerType: string | null;
  triggerConfig: unknown;
}): boolean => {
  if (!workflow.triggerType) return false;

  const config = (workflow.triggerConfig ?? {}) as {
    sources?: unknown[];
    recipientFilters?: { include?: unknown[] };
  };

  if (workflow.triggerType === "newActivity") {
    return Boolean(config.sources?.length);
  }

  return Boolean(config.recipientFilters?.include?.length);
};

/** Why the trigger is not finished, in words. Null when it is. */
export const describeTriggerGap = (workflow: {
  triggerType: string | null;
  triggerConfig: unknown;
}): string | null => {
  if (!workflow.triggerType) return "Who should this go to, and when";
  if (isTriggerComplete(workflow)) return null;

  return workflow.triggerType === "newActivity"
    ? "Not watching anything yet"
    : "No audience chosen yet";
};

export interface StepsReadiness {
  complete: boolean;
  /** Steps whose config is unfinished. */
  incomplete: number;
  hasSendStep: boolean;
  /** Branches missing a yes or a no edge. */
  danglingBranches: number;
  /** Steps nothing can reach from the entry. */
  orphans: number;
  /** One line for the stepper. Null once everything is ready. */
  gap: string | null;
}

/**
 * How close the steps are to publishable.
 *
 * Still a **subset** of the backend validator rather than a copy of it — the
 * publish dialog shows the API's own errors and stays the authority. What this
 * adds is enough to make the tick honest: a send step exists, every step is
 * configured, every branch has both its paths, and nothing is stranded.
 *
 * Those four are the ones an admin can see on the canvas and fix; the rest
 * (cycles, unknown node types) cannot be produced by the editor at all.
 */
export const stepsReadiness = (
  definition: WorkflowDefinition | undefined,
): StepsReadiness => {
  const nodes = definition?.nodes ?? [];
  const edges = definition?.edges ?? [];

  const hasSendStep = nodes.some((n) => n.type === "sendEmail");
  const incomplete = nodes.filter(isStepIncomplete).length;

  const danglingBranches = nodes.filter(
    (n) =>
      n.type === "branch" &&
      !(
        edges.some((e) => e.from === n.id && e.label === "yes") &&
        edges.some((e) => e.from === n.id && e.label === "no")
      ),
  ).length;

  // Reachability from the entry, matching what the backend refuses.
  const hasIncoming = new Set(edges.map((e) => e.to));
  const entry =
    (definition?.entryNodeId &&
      nodes.find((n) => n.id === definition.entryNodeId)?.id) ||
    nodes.find((n) => n.type !== "exit" && !hasIncoming.has(n.id))?.id ||
    nodes[0]?.id;

  let orphans = 0;

  if (entry && nodes.length) {
    const reachable = new Set([entry]);
    const queue = [entry];

    while (queue.length) {
      const current = queue.shift() as string;
      for (const edge of edges) {
        if (edge.from !== current || reachable.has(edge.to)) continue;
        reachable.add(edge.to);
        queue.push(edge.to);
      }
    }

    orphans = nodes.filter((n) => !reachable.has(n.id)).length;
  }

  const complete =
    hasSendStep &&
    incomplete === 0 &&
    danglingBranches === 0 &&
    orphans === 0 &&
    nodes.length > 0;

  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;

  const gap = complete
    ? null
    : !hasSendStep
      ? "Needs at least one Send email"
      : incomplete > 0
        ? `${plural(incomplete, "step", "steps")} still to fill in`
        : danglingBranches > 0
          ? `${plural(danglingBranches, "if/then needs", "if/thens need")} both paths connected`
          : `${plural(orphans, "step is", "steps are")} not connected`;

  return { complete, incomplete, hasSendStep, danglingBranches, orphans, gap };
};

/* ── draft vs published ──────────────────────────────────────────────────── */

/**
 * JSON with the keys in a fixed order, so two equal objects stringify equally.
 *
 * `JSON.stringify` preserves insertion order, and the draft is assembled by the
 * editor while the published copy comes back from Postgres — the same trigger
 * config can arrive with its keys in a different order from each. Without this
 * a workflow nobody has touched reads as changed.
 */
const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);

  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      out[key] = stable(source[key]);
    }
    return out;
  }

  return value;
};

/** The entry node, resolved the way the backend resolves it on publish. */
const entryIdOf = (definition: WorkflowDefinition | undefined): string | null => {
  const nodes = definition?.nodes ?? [];
  const edges = definition?.edges ?? [];

  if (definition?.entryNodeId && nodes.some((n) => n.id === definition.entryNodeId)) {
    return definition.entryNodeId;
  }

  const hasIncoming = new Set(edges.map((e) => e.to));

  return nodes.find((n) => n.type !== "exit" && !hasIncoming.has(n.id))?.id ?? null;
};

/**
 * The comparable shape: the graph and the trigger, and nothing else.
 *
 * **Positions are dropped on purpose.** Dragging a card two pixels left changes
 * the definition that gets saved but changes nothing about what anybody
 * receives, and counting it would leave "unpublished changes" showing forever
 * after somebody tidied the canvas.
 */
const signature = (
  definition: WorkflowDefinition | undefined,
  triggerType: string | null,
  triggerConfig: unknown,
): string =>
  JSON.stringify(
    stable({
      nodes: [...(definition?.nodes ?? [])]
        .map((n) => ({ id: n.id, type: n.type, config: n.config ?? {} }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      edges: [...(definition?.edges ?? [])]
        .map((e) => ({ from: e.from, to: e.to, label: e.label ?? null }))
        .sort((a, b) =>
          `${a.from}|${a.label}|${a.to}`.localeCompare(`${b.from}|${b.label}|${b.to}`),
        ),
      entryNodeId: entryIdOf(definition),
      trigger: { type: triggerType ?? null, config: triggerConfig ?? {} },
    }),
  );

/**
 * Does the draft differ from the version that is live?
 *
 * The reason "Publish changes" used to sit there forever after publishing: the
 * label was driven by `currentVersion` being set, which only ever says
 * *something* was published, never whether anything has changed since. So a
 * workflow that was published and never touched again read as having work
 * outstanding, permanently.
 *
 * **Unsure counts as changed.** Every wrong answer here is a nuisance except
 * one — reporting "nothing to publish" for a draft that really has changes
 * would hide the button that ships them. Anything unexpected returns true.
 */
export const hasUnpublishedChanges = (
  workflow: {
    definition: WorkflowDefinition;
    triggerType: string | null;
    triggerConfig: unknown;
  },
  activeVersion: { definition?: (WorkflowDefinition & { trigger?: unknown }) | null } | null,
): boolean => {
  const published = activeVersion?.definition;

  if (!published) return true;

  const trigger = (published.trigger ?? {}) as {
    type?: string | null;
    config?: unknown;
  };

  try {
    return (
      signature(workflow.definition, workflow.triggerType, workflow.triggerConfig) !==
      signature(published, trigger.type ?? null, trigger.config ?? {})
    );
  } catch {
    return true;
  }
};
