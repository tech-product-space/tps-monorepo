"use client";

import EnrollmentList from "../EnrollmentList";

/**
 * The editor's Enrolments tab — the shared list, scoped to this workflow.
 *
 * A thin wrapper rather than a second implementation: "who is in this workflow"
 * and "who is in any workflow" are the same table with one filter, and keeping
 * them as one component means a column added here appears in both.
 */
export default function EnrollmentsPanel({ workflowId }: { workflowId: string }) {
  return <EnrollmentList workflowId={workflowId} showSearch />;
}
