// Creates the three brand schemas in the shared database. Idempotent.
//   DATABASE_URL=postgres://... node apps/api/scripts/create-schemas.js
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../.env") });
const { Client } = require("pg");
const { BRANDS, enabledBrands } = require("../lib/brands");
const { assertSchema } = require("@ps/env/db");

(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    for (const name of enabledBrands()) {
      const schema = assertSchema(BRANDS[name].env.PG_SCHEMA || name);
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      console.log(`schema "${schema}" ready`);
    }
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
