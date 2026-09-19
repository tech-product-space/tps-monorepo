// One pool per brand. This used to build a second Sequelize instance next to the
// one in models/index.js; it now re-exports that one so there is a single pool
// and a single place that sets the brand's schema (see config/config.js).
module.exports = require("../models").sequelize;
