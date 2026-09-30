"use strict";

const { NODE_TYPE } = require("../../../constants/workflow");

const handlers = {
  [NODE_TYPE.ACTION_SEND_EMAIL]: require("./nodeHandlers/action.send_email"),
  [NODE_TYPE.CONTROL_DELAY]: require("./nodeHandlers/control.delay"),
  [NODE_TYPE.CONTROL_GOAL]: require("./nodeHandlers/control.goal"),
  [NODE_TYPE.CONTROL_CONDITION]: require("./nodeHandlers/control.condition"),
};

function getHandler(nodeType) {
  return handlers[nodeType] || null;
}

module.exports = { getHandler };
