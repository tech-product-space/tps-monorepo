"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import type {
  Workflow,
  WorkflowEdge,
  WorkflowNode,
} from "@/types/workflow";
import { workflowService } from "@/services/workflow/workflowService";

import NodeConfigSheet from "../editor/NodeConfigSheet";
import WorkflowCanvas from "../editor/canvas/WorkflowCanvas";
import {
  buildDraftDefinition,
  cleanEmailNodes,
  ensureExitExists,
} from "../editor/utils";

type Props = {
  workflow: Workflow;
  onChanged: () => void;
  readOnly: boolean;
  onSwitchToTrigger?: () => void;
};

export default function WorkflowEditorTab({
  workflow,
  onChanged,
  readOnly,
  onSwitchToTrigger,
}: Props) {
  const [nodes, setNodes] = useState<WorkflowNode[]>(() =>
    ensureExitExists(workflow.draft_definition?.nodes || [])
  );
  const [edges, setEdges] = useState<WorkflowEdge[]>(
    () => workflow.draft_definition?.edges || []
  );
  const [entryNodeId, setEntryNodeId] = useState<string | null>(
    workflow.draft_definition?.entry_node_id ?? null
  );
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipNextSync = useRef(false);

  // Canvas theme — per-browser preference, default light. Scoped to the
  // canvas only (a `.dark` ancestor flips Tailwind `dark:` variants on the
  // node cards + a scoped <style> block flips ReactFlow's chrome).
  const [canvasTheme, setCanvasTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("workflow_canvas_theme");
    if (stored === "dark" || stored === "light") setCanvasTheme(stored);
  }, []);
  const toggleTheme = () => {
    setCanvasTheme((t) => {
      const next = t === "light" ? "dark" : "light";
      try {
        window.localStorage.setItem("workflow_canvas_theme", next);
      } catch {
        // ignore storage failures (private mode, quota, etc.)
      }
      return next;
    });
  };

  useEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }
    setNodes(ensureExitExists(workflow.draft_definition?.nodes || []));
    setEdges(workflow.draft_definition?.edges || []);
    setEntryNodeId(workflow.draft_definition?.entry_node_id ?? null);
  }, [workflow.draft_definition, workflow.id]);

  // Debounced save: position drags + repeated edge edits should coalesce.
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scheduleSave = (
    nextNodes: WorkflowNode[],
    nextEdges: WorkflowEdge[],
    nextEntry: string | null
  ) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      persist(nextNodes, nextEdges, nextEntry);
    }, 350);
  };

  const persist = async (
    nextNodes: WorkflowNode[],
    nextEdges: WorkflowEdge[],
    nextEntry: string | null
  ) => {
    try {
      setSaving(true);
      setError(null);
      skipNextSync.current = true;
      // Sanitize every send_email body before it hits the DB so the engine
      // and the test-send path read already-clean HTML. Mirrors the backend's
      // cleanHtml from utils/email/htmlHelpers.
      const sanitizedNodes = cleanEmailNodes(nextNodes);
      await workflowService.update(workflow.id, {
        draft_definition: buildDraftDefinition(
          sanitizedNodes,
          nextEdges,
          nextEntry
        ),
      });
      // Refresh the parent so the readiness stepper + tab dots recompute
      // from the just-saved draft instead of the stale snapshot they had
      // before this edit. `skipNextSync` keeps the parent's refetch from
      // clobbering local editor state.
      onChanged();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to save");
      skipNextSync.current = false;
    } finally {
      setSaving(false);
    }
  };

  const handleCanvasChange = (
    nextNodes: WorkflowNode[],
    nextEdges: WorkflowEdge[],
    nextEntry: string | null
  ) => {
    const guarded = ensureExitExists(nextNodes);
    setNodes(guarded);
    setEdges(nextEdges);
    setEntryNodeId(nextEntry);
    scheduleSave(guarded, nextEdges, nextEntry);
  };

  const handleConfigChange = (id: string, config: WorkflowNode["config"]) => {
    const next = nodes.map((n) => (n.id === id ? { ...n, config } : n));
    setNodes(next);
    scheduleSave(next, edges, entryNodeId);
  };

  const editingNode = useMemo(
    () => nodes.find((n) => n.id === editingNodeId) || null,
    [nodes, editingNodeId]
  );

  const isNodeIncomplete = (node: WorkflowNode): boolean => {
    const c: any = node.config || {};
    if (node.type === "action.send_email") {
      return !c.subject || !c.html_body || !c.from_email || !c.from_name;
    }
    if (node.type === "control.delay") {
      return !c.duration_value || !c.duration_unit;
    }
    if (node.type === "control.goal") return false;
    if (node.type === "control.condition") {
      if (!c.event_type || !c.timeout_value || !c.timeout_unit) return true;
      const matchEdge = edges.find(
        (e) => e.from === node.id && e.label === "match"
      );
      const noMatchEdge = edges.find(
        (e) => e.from === node.id && e.label === "no_match"
      );
      if (!matchEdge || !noMatchEdge) return true;
    }
    return false;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {readOnly
            ? "This workflow is published and read-only."
            : "Click any step to edit. Use the + button to add the next step. Drag steps to rearrange."}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {saving && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> saving
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            title={
              canvasTheme === "dark"
                ? "Switch canvas to light theme"
                : "Switch canvas to dark theme"
            }
            aria-label="Toggle canvas theme"
          >
            {canvasTheme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="p-3 text-sm text-destructive border-destructive/40">
          {error}
        </Card>
      )}

      <WorkflowCanvas
        workflow={workflow}
        nodes={nodes}
        edges={edges}
        entryNodeId={entryNodeId}
        readOnly={readOnly}
        theme={canvasTheme}
        onChange={handleCanvasChange}
        onEditNode={(id) => {
          const n = nodes.find((x) => x.id === id);
          if (!n) return;
          if (n.type === "control.goal") return;
          setEditingNodeId(id);
        }}
        onSwitchToTrigger={() => onSwitchToTrigger?.()}
        isNodeIncomplete={isNodeIncomplete}
      />

      <NodeConfigSheet
        node={editingNode}
        onClose={() => setEditingNodeId(null)}
        onChange={(c) =>
          editingNode && handleConfigChange(editingNode.id, c)
        }
        readOnly={readOnly}
      />
    </div>
  );
}
