import { connectDatabases } from "./database/index.js";
import { initEmailProviders } from "./services/email/emailManager.js";
import { initAgendaJobs } from "./jobs/index.js";
import { initCertificateFonts } from "./services/event/certificateFonts.js";

// Shared by the standalone server (server.js) and the monorepo gateway/worker.
export async function initServices({ agenda = true } = {}) {
  await connectDatabases();
  initEmailProviders();
  initCertificateFonts();
  if (agenda) initAgendaJobs();
}
