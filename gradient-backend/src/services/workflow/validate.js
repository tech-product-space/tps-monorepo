import {
  WORKFLOW_TRIGGER_TYPE,
  WORKFLOW_EDGE_LABEL,
  WORKFLOW_NODE_TYPE,
} from "../../config/constants/workflow.js";
import {
  getNodeHandler,
  SENDING_NODE_TYPES,
  SUPPORTED_NODE_TYPES,
} from "./nodes/index.js";
import { isSupportedSourceType } from "../campaign/recipientResolver/index.js";

/**
 * Everything a workflow must satisfy before it may be published.
 *
 * **`/validate` and `/publish` call this same function.** A publish that fails
 * on something the panel just said was fine is the worst possible version of
 * this feature, and the only way to guarantee that cannot happen is to have one
 * implementation.
 *
 * Returns `{ valid, errors[] }` — every error, not the first. An admin fixing
 * a workflow one error per round trip is how a five-minute job becomes twenty.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §9.
 */

/* ── config schemas ─────────────────────────────────────────────────────── */

/**
 * Checks one node's config against its handler's declared schema.
 *
 * A deliberately small validator rather than a library: the schemas are five
 * field types across three node types, and a dependency here would be doing
 * less than this does while being harder to read.
 */
const checkConfig = (schema, config, where) => {
  const errors = [];
  const value = config ?? {};

  for (const [field, rule] of Object.entries(schema)) {
    const v = value[field];
    const missing = v === undefined || v === null || v === "";

    if (rule.required && missing) {
      errors.push(`${where}: "${field}" is required`);
      continue;
    }

    if (missing) continue;

    if (rule.type === "number") {
      const n = Number(v);

      if (!Number.isFinite(n)) {
        errors.push(`${where}: "${field}" must be a number`);
        continue;
      }
      if (rule.min !== undefined && n < rule.min) {
        errors.push(`${where}: "${field}" must be at least ${rule.min}`);
      }
      if (rule.max !== undefined && n > rule.max) {
        errors.push(`${where}: "${field}" must be at most ${rule.max}`);
      }
      continue;
    }

    if (rule.type === "string") {
      if (typeof v !== "string") {
        errors.push(`${where}: "${field}" must be text`);
        continue;
      }
      if (rule.maxLength && v.length > rule.maxLength) {
        errors.push(
          `${where}: "${field}" is too long (max ${rule.maxLength} characters)`,
        );
      }
      if (rule.oneOf && !rule.oneOf.includes(v)) {
        errors.push(
          `${where}: "${field}" must be one of ${rule.oneOf.join(", ")}`,
        );
      }
    }
  }

  return errors;
};

/* ── the graph ──────────────────────────────────────────────────────────── */

/**
 * Depth-first cycle detection over the edge list.
 *
 * A cycle is rejected at publish, which is what makes `MAX_STEPS_PER_JOB` in
 * the runner a second line of defence rather than the only one. A runaway loop
 * that sends email is worth stopping twice.
 */
const findCycle = (nodes, edges) => {
  const out = new Map(nodes.map((n) => [n.id, []]));
  for (const edge of edges) {
    if (out.has(edge.from)) out.get(edge.from).push(edge.to);
  }

  const state = new Map(); // unvisited | visiting | done

  const walk = (id) => {
    if (state.get(id) === "visiting") return true;
    if (state.get(id) === "done") return false;

    state.set(id, "visiting");
    for (const next of out.get(id) ?? []) {
      if (walk(next)) return true;
    }
    state.set(id, "done");

    return false;
  };

  return nodes.some((n) => walk(n.id));
};

/**
 * Everything reachable from the entry node, following edges forwards.
 *
 * Labelled and unlabelled edges alike — a node only reachable down a branch's
 * `no` path is perfectly reachable, and treating it as an orphan would refuse
 * every workflow with an if/then in it.
 */
const reachableFrom = (entryId, edges) => {
  const out = new Map();
  for (const edge of edges) {
    if (!out.has(edge.from)) out.set(edge.from, []);
    out.get(edge.from).push(edge.to);
  }

  const seen = new Set();
  const stack = [entryId];

  while (stack.length) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    stack.push(...(out.get(id) ?? []));
  }

  return seen;
};

/**
 * The entry node: the one explicitly named, or the only node with no edges in.
 *
 * Inferring it rather than requiring it means a linear workflow built in the
 * phase-4 editor never has to think about the concept.
 */
export const resolveEntryNode = (definition) => {
  const nodes = definition?.nodes ?? [];
  const edges = definition?.edges ?? [];

  if (definition?.entryNodeId) {
    return nodes.find((n) => n.id === definition.entryNodeId) ?? null;
  }

  const hasIncoming = new Set(edges.map((e) => e.to));
  const roots = nodes.filter((n) => !hasIncoming.has(n.id));

  return roots.length === 1 ? roots[0] : null;
};

/**
 * Every source a static-list audience names, on both sides.
 *
 * Exported because publishing is not the only moment this matters. Publish is
 * where a broken audience is caught before it can do harm; Run is where one
 * published before this check existed still has to be caught, because the
 * alternative is what it did until now — `buildRecipients` throws inside the
 * bulk-enrol job, three retries later the job fails, and the admin is still
 * looking at "Run started" with nobody enrolled and nothing said.
 *
 * The exclude side is the half that was missed, and it is the more dangerous
 * one: `buildRecipients` refuses to resolve an unknown source rather than
 * skipping it, precisely so that a swallowed exclusion cannot mail the people
 * it was meant to leave out.
 *
 * @returns {string[]} empty when the audience is resolvable
 */
export const validateAudience = (
  recipientFilters,
  /**
   * A half-built draft has no audience yet, and the preview endpoint is what an
   * admin uses *while* building one. "You have not chosen an audience" is a
   * publish-time refusal, not a preview-time one — previewing nothing should
   * say nobody, not fail.
   */
  { requireInclude = true } = {},
) => {
  const errors = [];
  const include = recipientFilters?.include;
  const exclude = recipientFilters?.exclude;

  const check = (clauses, what, listLabel) => {
    if (clauses === undefined || clauses === null) return;

    if (!Array.isArray(clauses)) {
      errors.push(`The audience's ${listLabel} must be a list`);
      return;
    }

    clauses.forEach((clause, i) => {
      if (!clause?.type) {
        errors.push(`${what} ${i + 1} has no type`);
        return;
      }
      if (!isSupportedSourceType(clause.type)) {
        errors.push(`Audience cannot resolve "${clause.type}"`);
      }
    });
  };

  if (!Array.isArray(include) || !include.length) {
    if (requireInclude) errors.push("Choose an audience before publishing");
  } else {
    check(include, "Audience source", "included sources");
  }

  // Checked even when there is no audience to narrow. `buildRecipients` runs
  // the exclude side regardless of what include resolved to, so a broken
  // exclusion on a half-built draft still throws.
  check(exclude, "Exclusion", "exclusions");

  return errors;
};

/* ── trigger ────────────────────────────────────────────────────────────── */

const validateTrigger = (workflow) => {
  const errors = [];
  const { triggerType, triggerConfig } = workflow;

  if (!triggerType) {
    errors.push("Pick a trigger before publishing");
    return errors;
  }

  if (!Object.values(WORKFLOW_TRIGGER_TYPE).includes(triggerType)) {
    errors.push(`Unknown trigger type: ${triggerType}`);
    return errors;
  }

  if (triggerType === WORKFLOW_TRIGGER_TYPE.NEW_ACTIVITY) {
    const sources = triggerConfig?.sources;

    if (!Array.isArray(sources) || !sources.length) {
      errors.push("Choose at least one thing for the trigger to watch");
      return errors;
    }

    sources.forEach((source, i) => {
      if (!source?.type) {
        errors.push(`Trigger source ${i + 1} has no type`);
        return;
      }

      // Named, not silently dropped. A watched source that nothing can resolve
      // is a workflow that will never fire, and it must not look like a
      // workflow nobody has matched yet.
      if (!isSupportedSourceType(source.type)) {
        errors.push(`Trigger cannot watch "${source.type}"`);
      }
    });

    return errors;
  }

  // staticList
  errors.push(...validateAudience(triggerConfig?.recipientFilters));

  return errors;
};

/* ── the whole thing ────────────────────────────────────────────────────── */

/**
 * @param {object} workflow a `Workflow` instance or plain object
 * @returns {{valid: boolean, errors: string[]}}
 */
export const validateWorkflow = (workflow) => {
  const errors = [...validateTrigger(workflow)];

  const definition = workflow?.definition ?? {};
  const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
  const edges = Array.isArray(definition.edges) ? definition.edges : [];

  if (!nodes.length) {
    errors.push("Add at least one step");
    return { valid: false, errors };
  }

  /* ── node identity ── */
  const ids = new Set();
  for (const node of nodes) {
    if (!node?.id) {
      errors.push("A step is missing its id");
      continue;
    }
    if (ids.has(node.id)) {
      errors.push(`Two steps share the id "${node.id}"`);
    }
    ids.add(node.id);
  }

  /* ── node types and their config ── */
  nodes.forEach((node, i) => {
    const where = `Step ${i + 1}`;
    const handler = getNodeHandler(node?.type);

    if (!handler) {
      errors.push(
        `${where}: "${node?.type}" is not a step this system can run ` +
          `(known: ${SUPPORTED_NODE_TYPES.join(", ")})`,
      );
      return;
    }

    errors.push(...checkConfig(handler.configSchema, node.config, where));
  });

  /**
   * A branch needs both edges.
   *
   * With only a `yes`, everybody who did *not* do the thing silently falls off
   * the end of the graph — and that is most people, and precisely the group the
   * follow-up email was written for. The failure looks like "the workflow
   * finished", which is the worst possible disguise for it.
   */
  nodes.forEach((node, i) => {
    if (node?.type !== WORKFLOW_NODE_TYPE.BRANCH) return;

    const out = edges.filter((e) => e.from === node.id);

    for (const label of Object.values(WORKFLOW_EDGE_LABEL)) {
      if (!out.some((e) => e.label === label)) {
        errors.push(
          `Step ${i + 1}: the "${label}" path is not connected to anything`,
        );
      }
    }
  });

  /* ── edges point somewhere ── */
  for (const edge of edges) {
    if (!ids.has(edge?.from)) {
      errors.push(`A connection starts from a step that does not exist`);
    }
    if (!ids.has(edge?.to)) {
      errors.push(`A connection points at a step that does not exist`);
    }
    if (
      edge?.label &&
      !Object.values(WORKFLOW_EDGE_LABEL).includes(edge.label)
    ) {
      errors.push(`Unknown connection label: ${edge.label}`);
    }
  }

  /* ── shape ── */
  const entry = resolveEntryNode(definition);

  if (!entry) {
    errors.push(
      definition.entryNodeId
        ? "The first step points at a step that does not exist"
        : "Cannot tell which step comes first — connect the steps into one sequence",
    );
  }

  if (findCycle(nodes, edges)) {
    errors.push("The steps loop back on themselves");
  } else if (entry) {
    // Only meaningful once the graph is acyclic; a cycle makes every node
    // trivially reachable and the message would be misleading.
    const reachable = reachableFrom(entry.id, edges);
    const orphans = nodes.filter((n) => !reachable.has(n.id));

    if (orphans.length) {
      errors.push(
        `${orphans.length} step${orphans.length > 1 ? "s are" : " is"} ` +
          `not connected to the rest of the workflow`,
      );
    }
  }

  /**
   * A workflow that sends nothing is a mistake, always.
   *
   * It is a legal graph — trigger, wait, exit — and it would run happily,
   * enrolling people and mailing none of them. There is no reason to want one,
   * and every reason to catch it before it looks like a delivery bug.
   */
  const sends = nodes.some((n) => SENDING_NODE_TYPES.includes(n?.type));

  if (!sends) {
    errors.push("This workflow never sends anything — add a Send email step");
  }

  return { valid: errors.length === 0, errors };
};
