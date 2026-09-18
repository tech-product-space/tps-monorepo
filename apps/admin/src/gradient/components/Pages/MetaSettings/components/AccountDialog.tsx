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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import { Switch } from "@/gradient/components/ui/switch";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { metaService } from "@/gradient/services/metaService";
import type { MetaAccount, MetaSourceTree } from "@/gradient/types/meta";

interface Props {
  open: boolean;
  account: MetaAccount | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Radix Select treats "" as "no value", so an explicit sentinel it is. */
const NONE = "__none__";

const EMPTY = {
  name: "",
  pageId: "",
  pageToken: "",
  defaultSourceId: NONE,
  defaultSubSourceId: NONE,
  enabled: true,
};

const AccountDialog = ({ open, account, onClose, onSaved }: Props) => {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [sources, setSources] = useState<MetaSourceTree[]>([]);

  const isEdit = Boolean(account);

  useEffect(() => {
    if (!open) return;

    setForm(
      account
        ? {
            name: account.name,
            pageId: account.pageId,
            // Never prefilled: the token is not sent to the browser at all.
            pageToken: "",
            defaultSourceId: account.defaultSourceId || NONE,
            defaultSubSourceId: account.defaultSubSourceId || NONE,
            enabled: account.enabled,
          }
        : EMPTY,
    );
  }, [open, account]);

  /**
   * The catalogue behind both selects.
   *
   * Fetched on open rather than once at mount, so a source added on the Meta
   * Leads screen is offered here without a page reload.
   */
  useEffect(() => {
    if (!open) return;

    metaService
      .listSources()
      .then((res) => setSources(res.data || []))
      .catch(() => {
        /* The dialog still works with no default routing; not worth a toast. */
      });
  }, [open]);

  const subSources =
    sources.find((source) => source.id === form.defaultSourceId)?.subSources ?? [];

  const set = (key: keyof typeof EMPTY, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.pageId.trim()) {
      toast.error("Name and Page ID are required");
      return;
    }

    if (!isEdit && !form.pageToken.trim()) {
      toast.error("A page access token is required to connect a page");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: form.name.trim(),
        pageId: form.pageId.trim(),
        defaultSourceId:
          form.defaultSourceId === NONE ? null : form.defaultSourceId,
        defaultSubSourceId:
          form.defaultSubSourceId === NONE ? null : form.defaultSubSourceId,
        enabled: form.enabled,
        // Omitted when blank, which the API reads as "keep the current token".
        ...(form.pageToken.trim() ? { pageToken: form.pageToken.trim() } : {}),
      };

      if (isEdit && account) {
        await metaService.updateAccount(account.id, payload);
        toast.success("Account updated");
      } else {
        await metaService.createAccount(payload);
        toast.success("Page connected — validate the token next");
      }

      onSaved();
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not save this account"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/*
        `[&>*]:min-w-0` is load-bearing, not decoration.

        DialogContent is a CSS grid, and grid children default to
        `min-width: auto` — so the widest unbreakable thing inside (here, the
        curl command) sets the column width and pushes every input past the
        dialog edge. Constraining the children lets the <pre> scroll instead.

        max-h + overflow-y keeps a tall form usable on a laptop screen.
      */}
      <DialogContent className="max-h-[90vh] overflow-y-auto text-sm sm:max-w-2xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Facebook page" : "Connect a Facebook page"}
          </DialogTitle>
          <DialogDescription>
            Leads from this page&apos;s lead ad forms will be imported every five
            minutes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block">Account name</Label>
            <Input
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Gradient Learnings"
            />
          </div>

          <div>
            <Label className="mb-1.5 block">Facebook Page ID</Label>
            <Input
              value={form.pageId}
              onChange={(event) => set("pageId", event.target.value)}
              placeholder="361603210370170"
            />
          </div>

          <div>
            <Label className="mb-1.5 block">
              Page access token {isEdit && "(leave blank to keep the current one)"}
            </Label>
            <Input
              type="password"
              value={form.pageToken}
              onChange={(event) => set("pageToken", event.target.value)}
              placeholder={isEdit ? "••••••••••••••••" : "EAAG…"}
              autoComplete="new-password"
            />
            {/*
              The single most common mistake connecting a page: pasting the
              system user token instead of the page token derived from it. The
              command is here because the error it prevents costs an hour.
            */}
            <p className="mt-1.5 text-xs text-muted-foreground">
              This must be a <strong>page</strong> token, not a system user
              token. Derive one with:
            </p>
            <pre className="mt-1 max-w-full overflow-x-auto rounded bg-muted p-2 text-[11px] whitespace-pre">
              {`curl "https://graph.facebook.com/v22.0/<PAGE_ID>?fields=access_token&access_token=<SYSTEM_USER_TOKEN>"`}
            </pre>
            <p className="mt-1 text-xs text-muted-foreground">
              Generate the system user token with <code>leads_retrieval</code>,{" "}
              <code>pages_show_list</code> and <code>pages_read_engagement</code>,
              set to never expire.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
            <div className="col-span-2 text-sm font-medium">
              Default routing
              <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                Used for any form on this page you have not mapped individually.
                Manage the list from the Meta Leads screen.
              </p>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs">Source</Label>
              <Select
                value={form.defaultSourceId}
                onValueChange={(value) => {
                  set("defaultSourceId", value);
                  // Sub sources belong to a source, so switching the parent
                  // must clear the child rather than leave a mismatched pair.
                  set("defaultSubSourceId", NONE);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {sources.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {source.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs">Sub source</Label>
              <Select
                value={form.defaultSubSourceId}
                disabled={form.defaultSourceId === NONE}
                onValueChange={(value) => set("defaultSubSourceId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {subSources.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {sources.length === 0 && (
              <p className="col-span-2 text-xs text-amber-700">
                No sources defined yet. Add them on Leads &rarr; Meta Leads
                &rarr; Manage sources, then come back here.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Enabled</div>
              <div className="text-xs text-muted-foreground">
                The poll skips a disabled page entirely.
              </div>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(checked) => set("enabled", checked)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Connect page"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AccountDialog;
