/**
 * Unified backend entrypoint. One repo, three bootable targets, chosen by BRAND.
 *
 * BRAND=tps       -> native TPS content domain (server.tps.js, this directory's own code)
 * BRAND=gradient  -> Gradient content domain (brands/gradient, real ESM code, own node_modules)
 * BRAND=crm       -> shared CRM/sales service (crm/, own node_modules)
 *
 * Each target keeps its own DB connection(s) and its own dependency tree (see README.md
 * for why: gradient-backend and tps-crm-backend pin different majors of shared deps like
 * multer/agenda/ioredis than the native tps code, so hoisting everything into one
 * node_modules would force a breaking downgrade/upgrade on at least one of the three).
 * `npm run postinstall` installs all three trees; this file only decides which one boots.
 */

const BRAND = (process.env.BRAND || "tps").toLowerCase();

async function main() {
  switch (BRAND) {
    case "tps":
      require("./server.tps.js");
      break;
    case "gradient":
      // gradient-backend is real ESM (see brands/gradient/package.json "type": "module"),
      // so it must be loaded with a dynamic import from this CommonJS entrypoint.
      await import("./brands/gradient/src/server.js");
      break;
    case "crm":
      require("./crm/src/index.js");
      break;
    default:
      console.error(
        `Unknown BRAND "${BRAND}". Expected one of: tps, gradient, crm.`
      );
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Failed to start backend for BRAND=${BRAND}:`, err);
  process.exit(1);
});
