"use strict";

const {
  NODE_TYPE,
  TRIGGER_TYPE,
  EDGE_LABEL,
} = require("../../../constants/workflow");
const { validateNodeConfig } = require("./nodeConfigSchemas");

function validateDefinition(definition) {
  const errors = [];
  const def = definition || {};
  const { trigger, nodes, edges } = def;

  if (!trigger || !Object.values(TRIGGER_TYPE).includes(trigger.type)) {
    errors.push("Trigger is missing or has an unknown type");
  }

  if (!Array.isArray(nodes) || nodes.length === 0) {
    errors.push("Workflow must have at least one node");
    return { valid: false, errors };
  }

  const safeEdges = Array.isArray(edges) ? edges : [];

  const idSet = new Set();
  for (const n of nodes) {
    if (!n || !n.id) {
      errors.push("A node is missing an id");
      continue;
    }
    if (idSet.has(n.id)) {
      errors.push(`Duplicate node id: ${n.id}`);
    }
    idSet.add(n.id);
    if (!Object.values(NODE_TYPE).includes(n.type)) {
      errors.push(`Node ${n.id}: unknown type '${n.type}'`);
    }
  }

  for (const e of safeEdges) {
    if (!idSet.has(e.from)) {
      errors.push(`Edge references unknown 'from' node: ${e.from}`);
    }
    if (!idSet.has(e.to)) {
      errors.push(`Edge references unknown 'to' node: ${e.to}`);
    }
  }

  for (const n of nodes) {
    if (n.type !== NODE_TYPE.CONTROL_CONDITION) continue;
    const out = safeEdges.filter((e) => e.from === n.id);
    const labels = out.map((e) => e.label).sort();
    if (
      out.length !== 2 ||
      labels[0] !== EDGE_LABEL.MATCH ||
      labels[1] !== EDGE_LABEL.NO_MATCH
    ) {
      errors.push(
        `Condition node ${n.id} must have exactly two outgoing edges labeled '${EDGE_LABEL.MATCH}' and '${EDGE_LABEL.NO_MATCH}'`
      );
    }
  }

  for (const n of nodes) {
    if (n.type !== NODE_TYPE.CONTROL_GOAL) continue;
    const out = safeEdges.filter((e) => e.from === n.id);
    if (out.length > 0) {
      errors.push(`Goal node ${n.id} cannot have outgoing edges`);
    }
  }

  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of safeEdges) {
    if (adj.has(e.from)) adj.get(e.from).push(e.to);
  }

  const color = new Map(nodes.map((n) => [n.id, "white"]));
  let hasCycle = false;
  function dfs(u) {
    color.set(u, "gray");
    for (const v of adj.get(u) || []) {
      if (color.get(v) === "gray") return true;
      if (color.get(v) === "white" && dfs(v)) return true;
    }
    color.set(u, "black");
    return false;
  }
  for (const n of nodes) {
    if (color.get(n.id) === "white" && dfs(n.id)) {
      hasCycle = true;
      break;
    }
  }
  if (hasCycle) errors.push("Workflow contains a cycle");

  const incoming = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of safeEdges) {
    if (incoming.has(e.to)) incoming.set(e.to, incoming.get(e.to) + 1);
  }
  const entries = [...incoming.entries()].filter(([, c]) => c === 0);

  if (def.entry_node_id) {
    const explicit = nodes.find((n) => n.id === def.entry_node_id);
    if (!explicit) {
      errors.push(
        `entry_node_id '${def.entry_node_id}' is not present in nodes`
      );
    } else if ((incoming.get(def.entry_node_id) || 0) > 0) {
      errors.push(
        `Entry node '${def.entry_node_id}' must not have incoming edges`
      );
    }
  } else if (entries.length !== 1) {
    errors.push(
      `Workflow must have exactly one entry node (found ${entries.length})`
    );
  }

  for (const n of nodes) {
    const out = safeEdges.filter((e) => e.from === n.id);
    if (out.length === 0 && n.type !== NODE_TYPE.CONTROL_GOAL) {
      errors.push(`Node ${n.id} is a dead-end and is not a goal node`);
    }
  }

  for (const n of nodes) {
    if (!Object.values(NODE_TYPE).includes(n.type)) continue;
    const cfgErr = validateNodeConfig(n);
    if (cfgErr) errors.push(`Node ${n.id}: ${cfgErr}`);
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateDefinition };
