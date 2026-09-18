"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  History,
  Loader2,
  Plus,
  Save,
  Search,
  Settings2,
} from "lucide-react";

import ManageSourcesDialog from "@/gradient/components/Pages/MetaLeads/components/ManageSourcesDialog";
import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent } from "@/gradient/components/ui/card";
import { Checkbox } from "@/gradient/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { metaService } from "@/gradient/services/metaService";
import type { MetaAccount, MetaForm, MetaSourceTree } from "@/gradient/types/meta";

import QuickAddSourceDialog from "./QuickAddSourceDialog";

interface Props {
  accounts: MetaAccount[];
}

/** Polls while any backfill is running, so progress moves without a refresh. */
const BACKFILL_POLL_MS = 3000;

/** Radix Select treats "" as "no value", so an explicit sentinel it is. */
const NONE = "__none__";

/** Not a value — picking it opens the quick-add dialog and selects nothing. */
const ADD = "__add__";

/** Which row, and which of its two selects, opened the quick-add dialog. */
interface AddTarget {
  formId: string;
  parent: MetaSourceTree | null;
}

/**
 * One row's backfill state, as a sentence.
 *
 * Hoisted to module scope like every other repeated row in this codebase: a
 * component declared inside the render body is a new type on every pass, so
 * React remounts it rather than updating it.
 */
const BackfillStatus = ({ form }: { form: MetaForm }) => {
  if (form.backfillStatus === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Backfilling — {form.backfillInserted} of {form.backfillTotal}
      </span>
    );
  }

  if (form.backfillStatus === "done") {
    return (
      <span className="text-muted-foreground">
        Backfilled {form.backfillInserted} imported,{" "}
        {form.backfillAlreadyImported} already had
        {form.backfillSkipped > 0 &&
          `, ${form.backfillSkipped} with no contact details`}
      </span>
    );
  }

  if (form.backfillStatus === "error") {
    return <span className="text-rose-700">{form.backfillError}</span>;
  }

  return <span className="text-muted-foreground">Never backfilled</span>;
};

const FormsTab = ({ accounts }: Props) => {
  const [accountId, setAccountId] = useState<string>("");
  const [forms, setForms] = useState<MetaForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Partial<MetaForm>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [backfillTarget, setBackfillTarget] = useState<MetaForm | null>(null);
  const [backfillSince, setBackfillSince] = useState("");

  const [sources, setSources] = useState<MetaSourceTree[]>([]);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  /** The form waiting on an answer to "what about the leads already here?". */
  const [reattribute, setReattribute] = useState<MetaForm | null>(null);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * The catalogue backing both selects.
   *
   * Active entries only: a retired source stays readable on the leads that
   * already used it, but must not be offered for new mappings.
   */
  const loadSources = useCallback(async () => {
    try {
      const res = await metaService.listSources();
      setSources(res.data || []);
    } catch {
      toast.error("Could not load sources");
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  useEffect(() => {
    if (!accountId && accounts.length) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  const fetchForms = useCallback(
    async (quiet = false) => {
      if (!accountId) return;

      if (!quiet) setLoading(true);

      try {
        const res = await metaService.listForms(accountId);
        setForms(res.data || []);
      } catch (error) {
        if (!quiet) toast.error(getApiErrorMessage(error, "Could not load forms"));
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [accountId],
  );

  useEffect(() => {
    setDrafts({});
    fetchForms();
  }, [fetchForms]);

  // Only poll while something is actually running — an idle settings tab should
  // not hold a request open every three seconds forever.
  useEffect(() => {
    const running = forms.some((form) => form.backfillStatus === "running");

    if (running && !timer.current) {
      timer.current = setInterval(() => fetchForms(true), BACKFILL_POLL_MS);
    }

    if (!running && timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }

    return () => {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    };
  }, [forms, fetchForms]);

  const setDraft = (id: string, patch: Partial<MetaForm>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const valueOf = <K extends keyof MetaForm>(form: MetaForm, key: K): MetaForm[K] =>
    (drafts[form.id]?.[key] ?? form[key]) as MetaForm[K];

  const isDirty = (form: MetaForm) => Boolean(drafts[form.id]);

  const sourceById = (id: string | null | undefined) =>
    sources.find((source) => source.id === id) ?? null;

  /**
   * Lands the freshly created entry straight into the row that asked for it.
   *
   * Without this the admin adds a source, then has to reopen the dropdown and
   * find it — the quick-add exists precisely to avoid that detour.
   */
  const handleCreated = async (created: { id: string }) => {
    if (!addTarget) return;

    const { formId, parent } = addTarget;

    await loadSources();

    setDraft(
      formId,
      parent
        ? { subSourceId: created.id }
        : { sourceId: created.id, subSourceId: null },
    );
  };

  const save = async (form: MetaForm, reattributeExisting: boolean) => {
    setSaving(form.id);

    try {
      const res = await metaService.updateForm(form.id, {
        sourceId: valueOf(form, "sourceId"),
        subSourceId: valueOf(form, "subSourceId"),
        courseId: valueOf(form, "courseId"),
        active: valueOf(form, "active"),
        reattributeExisting,
      });

      setDrafts((prev) => {
        const next = { ...prev };
        delete next[form.id];
        return next;
      });

      await fetchForms(true);
      setReattribute(null);

      // The server counts the rows it actually touched, so report that rather
      // than the leadCount we guessed from — a backfill running alongside this
      // would make the two disagree.
      toast.success(
        res.reattributed
          ? `Saved — ${res.reattributed} existing lead${
              res.reattributed === 1 ? "" : "s"
            } re-attributed`
          : "Mapping saved",
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not save the mapping"));
    } finally {
      setSaving(null);
    }
  };

  /**
   * Ask before saving, but only when the answer matters.
   *
   * A form with no leads yet, or an edit that only toggled Active, has nothing
   * to re-attribute — prompting there would train people to dismiss the dialog
   * without reading it, which is exactly when it stops protecting anything.
   */
  const handleSave = (form: MetaForm) => {
    const routingChanged =
      valueOf(form, "sourceId") !== form.sourceId ||
      valueOf(form, "subSourceId") !== form.subSourceId ||
      valueOf(form, "courseId") !== form.courseId;

    if (routingChanged && form.leadCount > 0) {
      setReattribute(form);
      return;
    }

    save(form, false);
  };

  const handleBackfill = async () => {
    if (!backfillTarget) return;

    try {
      await metaService.startBackfill(
        backfillTarget.id,
        backfillSince || undefined,
      );
      toast.success("Backfill queued");
      setBackfillTarget(null);
      setBackfillSince("");
      fetchForms(true);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not start the backfill"));
    }
  };

  const visible = forms.filter((form) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return form.name?.toLowerCase().includes(term) || form.formId.includes(term);
  });

  const unmappedCount = visible.filter((form) => form.isUnmapped).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Select a page" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search forms by name or ID"
            className="pl-9"
          />
        </div>

        <Button variant="outline" onClick={() => setManageOpen(true)}>
          <Settings2 className="mr-2 h-4 w-4" />
          Manage sources
        </Button>
      </div>

      {/*
        One note above the table rather than a banner inside every unmapped row.
        The warning matters — routing is frozen at import, so an unmapped form's
        leads cannot be re-attributed afterwards — but repeated per row it just
        pushes the mapping controls off screen.
      */}
      {!loading && unmappedCount > 0 && (
        <div className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>
              {unmappedCount} form{unmappedCount === 1 ? " is" : "s are"} not
              mapped
            </strong>{" "}
            and will fall back to the page&apos;s default routing. Attribution is
            recorded on each lead as it arrives and cannot be corrected later.
          </span>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && visible.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {forms.length === 0 ? (
              <>
                No forms cached for this page yet. Use <strong>Sync forms</strong>{" "}
                on the Accounts tab.
              </>
            ) : (
              <>No form matches that search.</>
            )}
          </CardContent>
        </Card>
      )}

      {!loading && visible.length > 0 && (
        // The row is wider than a laptop viewport once both selects are usable,
        // so the table scrolls inside its own box rather than the page.
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[260px]">Form</TableHead>
                <TableHead className="w-[200px]">Source</TableHead>
                <TableHead className="w-[200px]">Sub source</TableHead>
                <TableHead className="w-[160px]">Course ID</TableHead>
                <TableHead className="w-[80px] text-center">Active</TableHead>
                <TableHead className="w-[200px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {visible.map((form) => {
                const running = form.backfillStatus === "running";
                const selectedSourceId = valueOf(form, "sourceId");
                const selectedSource = sourceById(selectedSourceId);

                return (
                  <TableRow key={form.id} className="align-top">
                    <TableCell className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {form.name || form.formId}
                        </span>

                        {form.status && (
                          <Badge variant="outline" className="font-normal">
                            {form.status}
                          </Badge>
                        )}

                        {form.isUnmapped && (
                          <Badge
                            variant="outline"
                            className="border-amber-200 bg-amber-50 font-normal text-amber-800"
                          >
                            Not mapped
                          </Badge>
                        )}
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground">
                        {form.formId} · {form.leadCount} lead
                        {form.leadCount === 1 ? "" : "s"}
                      </div>

                      <div className="mt-1 text-xs">
                        <BackfillStatus form={form} />
                      </div>
                    </TableCell>

                    <TableCell className="py-3">
                      <Select
                        value={selectedSourceId || NONE}
                        onValueChange={(value) => {
                          if (value === ADD) {
                            setAddTarget({ formId: form.id, parent: null });
                            return;
                          }

                          setDraft(form.id, {
                            sourceId: value === NONE ? null : value,
                            // Sub sources belong to a source, so changing the
                            // parent must clear the child. The API rejects a
                            // mismatched pair, and sending one silently would
                            // surface only as a confusing save error.
                            subSourceId: null,
                          });
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Page default" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Page default</SelectItem>
                          {sources.map((source) => (
                            <SelectItem key={source.id} value={source.id}>
                              {source.displayName}
                            </SelectItem>
                          ))}
                          <SelectSeparator />
                          <SelectItem value={ADD}>
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Add a source
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>

                    <TableCell className="py-3">
                      <Select
                        value={valueOf(form, "subSourceId") || NONE}
                        // Nothing to choose — or to add under — until a source
                        // is picked, since sub sources are scoped to a parent.
                        disabled={!selectedSource}
                        onValueChange={(value) => {
                          if (value === ADD) {
                            setAddTarget({
                              formId: form.id,
                              parent: selectedSource,
                            });
                            return;
                          }

                          setDraft(form.id, {
                            subSourceId: value === NONE ? null : value,
                          });
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>None</SelectItem>
                          {(selectedSource?.subSources ?? []).map((sub) => (
                            <SelectItem key={sub.id} value={sub.id}>
                              {sub.displayName}
                            </SelectItem>
                          ))}
                          <SelectSeparator />
                          <SelectItem value={ADD}>
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Add a sub source
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>

                    <TableCell className="py-3">
                      <Input
                        value={valueOf(form, "courseId") || ""}
                        onChange={(event) =>
                          setDraft(form.id, { courseId: event.target.value })
                        }
                        placeholder="Optional"
                      />
                    </TableCell>

                    <TableCell className="py-3 text-center">
                      <Checkbox
                        className="mt-2.5"
                        checked={valueOf(form, "active")}
                        onCheckedChange={(checked) =>
                          setDraft(form.id, { active: Boolean(checked) })
                        }
                      />
                    </TableCell>

                    <TableCell className="py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={running || form.isUnmapped}
                          title={
                            form.isUnmapped
                              ? "Map this form before backfilling"
                              : undefined
                          }
                          onClick={() => setBackfillTarget(form)}
                        >
                          <History className="mr-1.5 h-3.5 w-3.5" />
                          Backfill
                        </Button>

                        {isDirty(form) && (
                          <Button
                            size="sm"
                            onClick={() => handleSave(form)}
                            disabled={saving === form.id}
                          >
                            <Save className="mr-1.5 h-3.5 w-3.5" />
                            Save
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/*
        Two outcomes, both legitimate, so neither is hidden behind the other.
        The safe one is the solid button: re-attribution cannot be undone, and
        an irreversible action should not be the one you hit by reflex.
      */}
      <Dialog
        open={Boolean(reattribute)}
        onOpenChange={(open) => !open && setReattribute(null)}
      >
        <DialogContent className="text-sm sm:max-w-lg [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>
              What about the {reattribute?.leadCount} lead
              {reattribute?.leadCount === 1 ? "" : "s"} already imported?
            </DialogTitle>
            <DialogDescription>
              Each lead stores the source it arrived under, so changing this
              mapping normally affects only leads that arrive from now on.
            </DialogDescription>
          </DialogHeader>

          {reattribute && (
            <div className="space-y-3">
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground">Changing to</div>
                <div className="font-medium">
                  {sourceById(valueOf(reattribute, "sourceId"))?.displayName ||
                    "Page default"}
                  {(() => {
                    const sub = sourceById(
                      valueOf(reattribute, "sourceId"),
                    )?.subSources.find(
                      (s) => s.id === valueOf(reattribute, "subSourceId"),
                    );
                    return sub ? ` / ${sub.displayName}` : "";
                  })()}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Currently on those leads
                </div>
                <div>
                  {reattribute.source?.displayName || "Facebook"}
                  {reattribute.subSource
                    ? ` / ${reattribute.subSource.displayName}`
                    : ""}
                </div>
              </div>

              <p className="text-xs text-amber-800">
                Re-attributing rewrites those {reattribute.leadCount} rows and
                cannot be undone. Any report already run against the old source
                will change.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              className="border-amber-300 text-amber-900 hover:bg-amber-50"
              disabled={saving === reattribute?.id}
              onClick={() => reattribute && save(reattribute, true)}
            >
              Update all {reattribute?.leadCount}
            </Button>

            <div className="flex gap-2">
              <Button
                variant="ghost"
                disabled={saving === reattribute?.id}
                onClick={() => setReattribute(null)}
              >
                Cancel
              </Button>
              <Button
                disabled={saving === reattribute?.id}
                onClick={() => reattribute && save(reattribute, false)}
              >
                Future leads only
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuickAddSourceDialog
        open={Boolean(addTarget)}
        parent={addTarget?.parent ?? null}
        onClose={() => setAddTarget(null)}
        onCreated={handleCreated}
      />

      <ManageSourcesDialog
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        onChanged={loadSources}
      />

      <Dialog
        open={Boolean(backfillTarget)}
        onOpenChange={(open) => !open && setBackfillTarget(null)}
      >
        <DialogContent className="text-sm sm:max-w-lg [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>Backfill {backfillTarget?.name}</DialogTitle>
            <DialogDescription>
              Imports this form&apos;s history from Facebook. Safe to run more
              than once — anything already imported is skipped.
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label className="mb-1.5 block">From date (optional)</Label>
            <Input
              type="date"
              value={backfillSince}
              onChange={(event) => setBackfillSince(event.target.value)}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Leave blank to import everything. Leads keep their original
              Facebook date, so they appear in the list at the right point in
              history rather than all dated today.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBackfillTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleBackfill}>Start backfill</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FormsTab;
