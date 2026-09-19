require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const { createGateway } = require("./app");
const { BRANDS } = require("./lib/brands");

async function main() {
  const { gateway, brands } = await createGateway();

  // Connect every brand's database before accepting traffic. A failure here
  // exits: better a failed deploy than a half-working gateway.
  for (const name of brands) {
    await BRANDS[name].connect();
    console.log(`[api] ${name}: database connected (schema=${BRANDS[name].env.PG_SCHEMA || "default"})`);
  }

  if (process.env.RUN_WORKERS_IN_API === "true") {
    // Single-process mode for a small box. Prefer apps/worker as its own process:
    // then an API restart never interrupts a job mid-send.
    await require("../worker/start").startWorkers(brands);
  }

  const port = process.env.PORT || 3000;
  gateway.listen(port, () => {
    console.log(`[api] listening on :${port} — ${brands.map((b) => BRANDS[b].prefix).join(" ")}`);
  });
}

main().catch((err) => {
  console.error("[api] failed to start:", err);
  process.exit(1);
});
