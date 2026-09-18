require("dotenv").config();
const { Sequelize } = require("sequelize");

// Local Postgres (homebrew/docker for local dev) doesn't speak SSL; the
// managed RDS instance requires it. Skip dialectOptions entirely for
// localhost so sequelize doesn't attempt an SSL handshake against it.
const IS_LOCAL_DB = ["localhost", "127.0.0.1"].includes(process.env.DB_HOST);

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "postgres",
    dialectOptions: IS_LOCAL_DB
        ? {}
        : {
            ssl: {
                require: true,
                rejectUnauthorized: false,
            },
        },
});

module.exports = sequelize;