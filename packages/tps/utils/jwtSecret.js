const psEnv = require("@ps/env/tps");

// The JWT signing secret. No fallback: a default string in the code would let
// anyone who has read it mint valid user and staff tokens.
if (!psEnv.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set (TPS_JWT_SECRET in the monorepo .env)");
}

module.exports = psEnv.JWT_SECRET;
