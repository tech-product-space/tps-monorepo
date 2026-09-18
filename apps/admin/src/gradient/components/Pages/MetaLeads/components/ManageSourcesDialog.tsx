"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  EyeOff,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Input } from "@/gradient/components/ui/input";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { cn } from "@/gradient/lib/utils";
import { metaService } from "@/gradient/services/metaService";
import type { MetaSource, MetaSourceTree } from "@/gradient/types/meta";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Lets the caller refresh anything that renders source labels. */
  onChanged?: () => void;
}

/** `MBA Bootcamp` → `mba-bootcamp`, mirroring the server-side setter. */
const toKey = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

/**
 * Hoisted, like every other repeated row in this codebase: a component declared
 * inside the render body is a new type on every pass, so React remounts the
 * buttons rather than updating them.
 */
const RowActions = ({
  row,
  busy,
  onToggleActive,
  onRemove,
}: {
  row: MetaSource;
  busy: string | null;
  onToggleActive: (row: MetaSource) => void;
  onRemove: (row: MetaSource) => void;
}) => (
  <div className="flex items-center gap-1">
    <Button
      size="sm"
      variant="ghost"
      disabled={busy === row.id}
      title={row.isActive ? "Retire — hides it from the pickers" : "Restore"}
      onClick={() => onToggleActive(row)}
    >
      <EyeOff className="h-3.5 w-3.5" />
    </Button>
    <Button
      size="sm"
      variant="ghost"
      className="text-destructive hover:text-destructive"
      disabled={busy === row.id}
      title="Delete — only possible when nothing references it"
      onClick={() => onRemove(row)}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  </div>
);

/**
 * The source catalogue.
 *
 * This exists because free-text routing on each form produced `facebook`,
 * `Facebook` and `fb` as three separate sources that no filter could reconcile
 * — and since routing is frozen onto each lead at import, every typo was
 * permanent. Sources are defined once here and *picked* everywhere else.
 */
const ManageSourcesDialog = ({ open, onClose, onChanged }: Props) => {
  const [tree, setTree] = useState<MetaSourceTree[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [newSource, setNewSource] = useState("");
  const [newSub, setNewSub] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);

    try {
      // Inactive rows are shown here — this is the screen for un-retiring one.
      const res = await metaService.listSources(true);
      setTree(res.data || []);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not load sources"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const after = async (message: string) => {
    toast.success(message);
    await load();
    onChanged?.();
  };

  const addSource = async () => {
    const displayName = newSource.trim();

    if (!displayName) return;

    setBusy("new");

    try {
      await metaService.createSource({ key: toKey(displayName), displayName });
      setNewSource("");
      await after("Source added");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not add that source"));
    } finally {
      setBusy(null);
    }
  };

  const addSubSource = async (parent: MetaSourceTree) => {
    const displayName = (newSub[parent.id] || "").trim();

    if (!displayName) return;

    setBusy(parent.id);

    try {
      await metaService.createSource({
        key: toKey(displayName),
        displayName,
        parentId: parent.id,
      });
      setNewSub((prev) => ({ ...prev, [parent.id]: "" }));
      setExpanded((prev) => ({ ...prev, [parent.id]: true }));
      await after("Sub source added");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not add that sub source"));
    } finally {
      setBusy(null);
    }
  };

  const toggleActive = async (row: MetaSource) => {
    setBusy(row.id);

    try {
      await metaService.updateSource(row.id, { isActive: !row.isActive });
      await after(row.isActive ? "Retired" : "Restored");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not update that source"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: MetaSource) => {
    setBusy(row.id);

    try {
      await metaService.deleteSource(row.id);
      await after("Deleted");
    } catch (error) {
      // The 409 explains exactly what still references it, so show it as-is
      // rather than a generic failure.
      toast.error(getApiErrorMessage(error, "Could not delete that source"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto text-sm sm:max-w-2xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Sources &amp; sub sources</DialogTitle>
          <DialogDescription>
            Define them once here, then pick them when mapping forms. A source
            already used by imported leads can be retired but not deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={newSource}
            placeholder="New source, e.g. Facebook"
            onChange={(event) => setNewSource(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && addSource()}
          />
          <Button onClick={addSource} disabled={busy === "new" || !newSource.trim()}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add
          </Button>
        </div>

        {newSource.trim() && (
          <p className="-mt-2 text-xs text-muted-foreground">
            Stored as <code>{toKey(newSource)}</code> — this is what gets
            recorded on every lead and cannot be changed later.
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tree.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No sources yet. Add one above.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {tree.map((source) => {
              const isOpen = expanded[source.id] ?? true;

              return (
                <div key={source.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      onClick={() =>
                        setExpanded((prev) => ({ ...prev, [source.id]: !isOpen }))
                      }
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      <span
                        className={cn(
                          "truncate font-medium",
                          !source.isActive && "text-muted-foreground line-through",
                        )}
                      >
                        {source.displayName}
                      </span>
                      <code className="shrink-0 text-xs text-muted-foreground">
                        {source.key}
                      </code>
                      {!source.isActive && (
                        <Badge variant="outline" className="shrink-0 font-normal">
                          Retired
                        </Badge>
                      )}
                    </button>

                    <RowActions
                      row={source}
                      busy={busy}
                      onToggleActive={toggleActive}
                      onRemove={remove}
                    />
                  </div>

                  {isOpen && (
                    <div className="mt-2 ml-6 space-y-2 border-l pl-3">
                      {source.subSources.map((sub) => (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span
                              className={cn(
                                "truncate",
                                !sub.isActive &&
                                  "text-muted-foreground line-through",
                              )}
                            >
                              {sub.displayName}
                            </span>
                            <code className="shrink-0 text-xs text-muted-foreground">
                              {sub.key}
                            </code>
                          </div>
                          <RowActions
                            row={sub}
                            busy={busy}
                            onToggleActive={toggleActive}
                            onRemove={remove}
                          />
                        </div>
                      ))}

                      <div className="flex gap-2 pt-1">
                        <Input
                          value={newSub[source.id] || ""}
                          placeholder="Add a sub source"
                          className="h-8"
                          onChange={(event) =>
                            setNewSub((prev) => ({
                              ...prev,
                              [source.id]: event.target.value,
                            }))
                          }
                          onKeyDown={(event) =>
                            event.key === "Enter" && addSubSource(source)
                          }
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === source.id || !newSub[source.id]?.trim()}
                          onClick={() => addSubSource(source)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ManageSourcesDialog;
