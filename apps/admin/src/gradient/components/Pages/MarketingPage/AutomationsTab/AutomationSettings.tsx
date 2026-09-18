"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";

import { workflowService } from "@/gradient/services/workflowService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";

/**
 * The one global setting: how many automations a person can be in at once.
 *
 * It is small, and it is the feature's main safety rail — so the page spends
 * its space explaining what raising it means rather than on the input.
 */
export default function AutomationSettings() {
  const [value, setValue] = useState<number>(1);
  const [initial, setInitial] = useState<number>(1);
  const [defaultValue, setDefaultValue] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    workflowService
      .getSettings()
      .then((res) => {
        setValue(res.settings.maxActiveWorkflowsPerPerson);
        setInitial(res.settings.maxActiveWorkflowsPerPerson);
        setDefaultValue(res.defaults.maxActiveWorkflowsPerPerson);
      })
      .catch((error) =>
        toast.error(getApiErrorMessage(error, "Failed to load settings")),
      )
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await workflowService.updateSettings(value);
      setInitial(value);
      toast.success("Saved");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not save"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-md border p-5">
        <Label htmlFor="cap">One person can be in</Label>

        <div className="mt-2 flex items-center gap-2">
          <Input
            id="cap"
            type="number"
            min={1}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="w-24"
          />
          <span className="text-sm text-muted-foreground">
            automation{value === 1 ? "" : "s"} at a time
            {value === defaultValue && " (default)"}
          </span>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          With the default of one, somebody being walked through a nurture
          sequence cannot be enrolled in a second automation until they finish.
        </p>

        {/* The reason this setting exists, said plainly — because the failure
            it prevents is invisible to whoever raises it. */}
        {value > 1 && (
          <p className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
            Above one, automations can overlap. Two that each send three emails
            in a week send six, and neither author will see it — each will look
            at their own and see three.
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={saving || value === initial || value < 1}
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Save
          </Button>
          {value !== initial && (
            <Button variant="ghost" onClick={() => setValue(initial)}>
              Reset
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        This does not stop an automation you have already started — it decides
        who can be enrolled next. To stop one, pause it.
      </p>
    </div>
  );
}
