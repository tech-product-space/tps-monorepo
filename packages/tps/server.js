const psEnv = require("@ps/env/tps");
require("dotenv").config();
const sequelize = require("./config/db");
const connectMongoDB = require("./config/mongoDb");

const app = require("./app");

// Crons and Agenda jobs register themselves on require, so they must stay out
// of app.js: the gateway starts them from apps/worker, not from the API process.
require("./cron");
require("./jobs");

const PORT = psEnv.PORT;

sequelize
    .authenticate()
    .then(async () => {
        console.log("PostgreSQL Connected Successfully");
        await connectMongoDB();
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    })
    .catch((err) => console.error("DB Connection Error:", err));
