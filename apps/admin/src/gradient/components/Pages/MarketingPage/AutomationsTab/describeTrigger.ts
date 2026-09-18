import { SOURCE_LABELS } from "@/gradient/types/campaign";
import type {
  NewActivityTriggerConfig,
  StaticListTriggerConfig,
  Workflow,
} from "@/gradient/types/workflow";

/**
 * The trigger in a sentence.
 *
 * Lives apart from the table because the same wording appears in the editor
 * header and the readiness stepper. "newActivity" is a value in a database
 * column, not something to show anybody.
 */
export const describeTrigger = (workflow: Workflow): string => {
  if (!workflow.triggerType) return "No trigger yet";

  if (workflow.triggerType === "newActivity") {
    const config = workflow.triggerConfig as NewActivityTriggerConfig;
    const sources = config?.sources ?? [];

    if (!sources.length) return "Watching nothing yet";

    const names = sources.map((s) => SOURCE_LABELS[s.type] ?? s.type);

    // Two named, then a count. Six source names in a table cell is unreadable,
    // and the point of the column is recognition rather than completeness.
    const listed =
      names.length <= 2
        ? names.join(" or ")
        : `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;

    // Whether it is narrowed matters more in a list than *how* — "Event
    // registrations" and "Event registrations, narrowed" are two very different
    // workflows, and the second one firing on nobody is the usual reason
    // somebody opens this row.
    const narrowed = sources.some(
      (s) => Object.keys(s.filters ?? {}).length > 0,
    );

    return `When someone arrives from ${listed}${narrowed ? ", narrowed" : ""}`;
  }

  const config = workflow.triggerConfig as StaticListTriggerConfig;
  const include = config?.recipientFilters?.include ?? [];

  if (!include.length) return "No audience yet";

  const names = include.map((c) => SOURCE_LABELS[c.type] ?? c.type);

  return `A list from ${
    names.length <= 2
      ? names.join(" and ")
      : `${names.slice(0, 2).join(", ")} +${names.length - 2} more`
  }`;
};
