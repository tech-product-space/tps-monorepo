import app from "./app.js";
import env from "./config/env.js";
import { connectDatabases } from "./database/index.js";
import { initEmailProviders } from "./services/email/emailManager.js";

import { initAgendaJobs } from "./jobs/index.js";
import { initCertificateFonts } from "./services/event/certificateFonts.js";

async function start() {
  await connectDatabases();
  initEmailProviders();
  initCertificateFonts();
  initAgendaJobs()
  app.listen(env.PORT, () => {
    console.log(`Server running on PORT: ${env.PORT}`);
  });
}

start();
