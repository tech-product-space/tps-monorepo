const psEnv = require("@ps/env/crm");
// Standalone entrypoint. The monorepo gateway (apps/api) imports ./app directly
// and starts the crons via ./cron from apps/worker instead.
const dotenv = require("dotenv");
dotenv.config();

const app = require("./app");
const { sequelize } = require("./models");

const PORT = psEnv.PORT || 4000;

sequelize
  .authenticate()
  .then(() => console.log("Database connected..."))
  .catch((err) => console.log("Error: " + err));

require("./cron");

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
