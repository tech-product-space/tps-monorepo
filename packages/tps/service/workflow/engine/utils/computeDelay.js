"use strict";

const { DURATION_UNIT } = require("../../../../constants/workflow");

const MS = {
  [DURATION_UNIT.SECONDS]: 1000,
  [DURATION_UNIT.MINUTES]: 60 * 1000,
  [DURATION_UNIT.HOURS]: 60 * 60 * 1000,
  [DURATION_UNIT.DAYS]: 24 * 60 * 60 * 1000,
  [DURATION_UNIT.WEEKS]: 7 * 24 * 60 * 60 * 1000,
};

function computeDelayMs(config) {
  if (!config) return 0;
  const unitMs = MS[config.duration_unit];
  const value = Number(config.duration_value);
  if (!unitMs || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(unitMs * value);
}

module.exports = { computeDelayMs };
