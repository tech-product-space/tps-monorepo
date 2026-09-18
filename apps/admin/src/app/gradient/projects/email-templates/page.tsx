"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import EmailTemplateEditor from "@/gradient/components/Pages/ProjectPage/EmailTemplateEditor";

/**
 * The global defaults every project inherits — no `projectId` on either.
 *
 * Two editors rather than tabs: they are short, they are edited at different
 * times for different reasons, and a tab hides the one you are not looking at
 * from somebody who did not know it existed.
 */
export default function Page() {
  return (
    <DashboardLayout title="Project emails">
      <div className="space-y-6">
        <EmailTemplateEditor type="downloadDelivery" />
        {/*
          No per-project variant: the project a submission acknowledgement is
          about did not exist until the moment it was sent, so there is nothing
          to override it on.
        */}
        <EmailTemplateEditor type="submissionAck" />
      </div>
    </DashboardLayout>
  );
}
