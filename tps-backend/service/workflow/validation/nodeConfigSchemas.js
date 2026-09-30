"use strict";

const {
  NODE_TYPE,
  DURATION_UNIT,
} = require("../../../constants/workflow");

const REQUIRED_FIELDS = {
  // Phase 2: inline subject + html_body on node config (no template service yet)
  [NODE_TYPE.ACTION_SEND_EMAIL]: [
    "subject",
    "html_body",
    "from_email",
    "from_name",
  ],
  [NODE_TYPE.ACTION_SEND_WHATSAPP]: [
    "template_name",
    "template_language",
    "bsp_account_id",
  ],
  [NODE_TYPE.CONTROL_DELAY]: ["duration_value", "duration_unit"],
  [NODE_TYPE.CONTROL_CONDITION]: [
    "event_type",
    "timeout_value",
    "timeout_unit",
  ],
  [NODE_TYPE.CONTROL_AB_SPLIT]: ["variants"],
  [NODE_TYPE.CONTROL_GOAL]: ["goal_name"],
};

// Events the condition node is allowed to listen for. Bounced / complained /
// goal.reached are recorded in lead_events but aren't useful as branch
// conditions, so we keep the picker short.
const CONDITION_EVENTS_ALLOWED = new Set([
  "email.opened",
  "email.clicked",
  "email.unsubscribed",
]);

function validateNodeConfig(node) {
  const reqs = REQUIRED_FIELDS[node.type] || [];
  const cfg = node.config || {};

  for (const key of reqs) {
    if (cfg[key] === undefined || cfg[key] === null || cfg[key] === "") {
      return `missing required config field '${key}'`;
    }
  }

  if (node.type === NODE_TYPE.CONTROL_DELAY) {
    if (!Object.values(DURATION_UNIT).includes(cfg.duration_unit)) {
      return `invalid duration_unit '${cfg.duration_unit}'`;
    }
    if (!Number.isInteger(cfg.duration_value) || cfg.duration_value <= 0) {
      return `duration_value must be a positive integer`;
    }
  }

  if (node.type === NODE_TYPE.CONTROL_AB_SPLIT) {
    if (!Array.isArray(cfg.variants) || cfg.variants.length < 2) {
      return `A/B split must have at least 2 variants`;
    }
    const sum = cfg.variants.reduce((a, v) => a + (v.weight || 0), 0);
    if (sum !== 100) {
      return `A/B split weights must sum to 100, got ${sum}`;
    }
    for (const v of cfg.variants) {
      if (!v.next_node_id) {
        return `A/B split variant missing 'next_node_id'`;
      }
    }
  }

  if (node.type === NODE_TYPE.ACTION_SEND_EMAIL) {
    if (typeof cfg.from_email !== "string" || !cfg.from_email.includes("@")) {
      return `from_email must be a valid email address`;
    }
  }

  if (node.type === NODE_TYPE.CONTROL_CONDITION) {
    if (!CONDITION_EVENTS_ALLOWED.has(cfg.event_type)) {
      return `event_type '${cfg.event_type}' is not allowed for condition`;
    }
    if (!Number.isInteger(cfg.timeout_value) || cfg.timeout_value <= 0) {
      return `timeout_value must be a positive integer`;
    }
    if (!Object.values(DURATION_UNIT).includes(cfg.timeout_unit)) {
      return `invalid timeout_unit '${cfg.timeout_unit}'`;
    }
  }

  return null;
}

module.exports = { validateNodeConfig };
