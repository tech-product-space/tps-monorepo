"use strict";

/**
 * Delay node handler. By the time this runs, the BullMQ wait has already
 * happened (advanceEnrollment scheduled this job with the appropriate delay
 * using utils/computeDelay.js). So this just signals "move on to the next
 * node, no further wait".
 */
exports.execute = async ({ node }) => {
  return {
    outcome: "next",
    output: {
      duration_value: node.config?.duration_value,
      duration_unit: node.config?.duration_unit,
    },
  };
};
