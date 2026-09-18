import eventReminderJob from "./eventReminderJob.js";
import activityLogRetentionJob from "./activityLogRetentionJob.js";
import certificateIssueJob from "./certificateIssueJob.js";
import freeCourseCertificateIssueJob from "./freeCourseCertificateIssueJob.js";
import campaignSendJob from "./campaignSendJob.js";
import metaPollJob from "./metaPollJob.js";
import metaFormSyncJob from "./metaFormSyncJob.js";
import metaBackfillJob from "./metaBackfillJob.js";

export function initAgendaJobs () {
    eventReminderJob();
    activityLogRetentionJob();
    certificateIssueJob();
    freeCourseCertificateIssueJob();
    campaignSendJob();

    // Facebook Lead Ads. Each defines its handler unconditionally and only
    // schedules itself when META_INTEGRATION_ENABLED is on, so the backfill
    // trigger keeps working even with the pollers switched off.
    metaPollJob();
    metaFormSyncJob();
    metaBackfillJob();
}
