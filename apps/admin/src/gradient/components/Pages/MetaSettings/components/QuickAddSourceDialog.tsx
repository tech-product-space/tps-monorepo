"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { metaService } from "@/gradient/services/metaService";
import type { MetaSource } from "@/gradient/types/meta";

/** `MBA Bootcamp` → `mba-bootcamp`, mirroring the server-side setter. */
export const toSourceKey = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

interface Props {
  open: boolean;
  /**
   * Null while adding a top-level source; set while adding a sub source, in
   * which case the new entry is scoped to that parent.
   */
  parent: { id: string; displayName: string } | null;
  onClose: () => void;
  onCreated: (source: MetaSource) => void;
}

/**
 * Adds one catalogue entry without leaving the mapping screen.
 *
 * The full catalogue — retiring, deleting, renaming — lives in Manage sources.
 * This is only the create half, because "the source I need isn't in the list"
 * is the one thing that interrupts mapping a form, and bouncing to another
 * screen to fix it loses every unsaved draft on this one.
 */
const QuickAddSourceDialog = ({ open, parent, onClose, onCreated }: Props) => {
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDisplayName("");
  }, [open, parent]);

  const key = toSourceKey(displayName);

  const handleSave = async () => {
    const name = displayName.trim();

    if (!name) {
      toast.error("Give it a name");
      return;
    }

    if (!key) {
      toast.error("That name has no letters or numbers to build a key from");
      return;
    }

    setSaving(true);

    try {
      const res = await metaService.createSource({
        key,
        displayName: name,
        parentId: parent?.id ?? null,
      });

      toast.success(parent ? "Sub source added" : "Source added");
      onCreated(res.data);
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not add that"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="text-sm sm:max-w-md [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>
            {parent ? `New sub source in ${parent.displayName}` : "New source"}
          </DialogTitle>
          <DialogDescription>
            {parent
              ? "Sub sources belong to one source, so this will only be offered under it."
              : "This becomes available on every page default and form mapping."}
          </DialogDescription>
        </DialogHeader>

        <div>
          <Label className="mb-1.5 block">Name</Label>
          <Input
            value={displayName}
            autoFocus
            onChange={(event) => setDisplayName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !saving) handleSave();
            }}
            placeholder={parent ? "MBA Bootcamp" : "Instagram"}
          />

          {/*
            The key is shown, not hidden, because it is permanent — it is what
            gets frozen onto every lead, and the API refuses to change it later.
            Better to see `mba-bootcamp` before saving than to discover it on a
            year of leads afterwards.
          */}
          <p className="mt-1.5 text-xs text-muted-foreground">
            Saved as{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              {key || "…"}
            </code>{" "}
            — this is recorded on each lead and cannot be changed later. The name
            above can.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !key}>
            {saving ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QuickAddSourceDialog;
