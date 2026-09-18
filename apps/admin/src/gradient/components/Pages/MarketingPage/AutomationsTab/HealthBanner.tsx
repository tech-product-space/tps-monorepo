"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { workflowService } from "@/gradient/services/workflowService";
import type { WorkflowHealth } from "@/gradient/types/workflow";

/**
 * Says out loud when automations are not actually running.
 *
 * Three things fail separately and all look identical from the workflow list —
 * the feature switched off, Redis unreachable, or no worker process — and in
 * every one of them a workflow sits there marked **Live** and enrols nobody.
 * That state is indistinguishable from a filter that matches nothing, which is
 * how somebody spends an afternoon debugging a trigger that was never running.
 *
 * Renders nothing when everything is healthy, and nothing on an error: a
 * broken health check must not put a scary banner above a working page.
 */
export default function HealthBanner() {
  const [health, setHealth] = useState<WorkflowHealth | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const result = await workflowService.health();
        if (!cancelled) setHealth(result);
      } catch {
        if (!cancelled) setHealth(null);
      }
    };

    check();
    // Slow on purpose. This is a "did somebody forget to start the worker"
    // check, not a dashboard — polling it every few seconds would be noise.
    const timer = setInterval(check, 60_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!health || health.healthy) return null;

  return (
    <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 mb-4">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
      <div className="text-sm">
        <div className="font-medium text-amber-900">
          Automations are not running
        </div>
        <p className="text-amber-800 mt-0.5">{health.message}</p>
      </div>
    </div>
  );
}
