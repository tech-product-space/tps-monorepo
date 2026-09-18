"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Textarea } from "@/gradient/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import Pagination from "@/gradient/components/ui/custom/Pagination";

import { contactService } from "@/gradient/services/contactService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import type { ContactList } from "@/gradient/types/contact";
import type { IPaginationMeta } from "@/gradient/types/pagination";

import ContactListTable from "./ContactListTable";
import ContactListDetail from "./ContactListDetail";
import UploadDialog from "./UploadDialog";

const EMPTY_META: IPaginationMeta = {
  total: 0,
  page: 1,
  limit: 10,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

/**
 * Contact lists — the one audience that is not a by-product of something the
 * product already recorded. Rendered by `/marketing/contacts`.
 *
 * List view and detail view in one component rather than a `/marketing/
 * contacts/[id]` route: opening a list is a drill-down, not a place anyone
 * deep-links to, and keeping it here means the sidebar's Contacts entry stays
 * lit while you are inside a list.
 */
export default function ContactsTab() {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [meta, setMeta] = useState<IPaginationMeta>(EMPTY_META);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState<ContactList | null>(null);
  const [uploadFor, setUploadFor] = useState<ContactList | null>(null);

  // One dialog for create and rename — the fields are identical, and a second
  // near-identical dialog is how the two drift apart.
  const [editing, setEditing] = useState<ContactList | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await contactService.lists({
        search: query || undefined,
        page,
        limit,
      });
      setLists(res.data || []);
      if (res.meta) setMeta(res.meta);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load contact lists"));
    } finally {
      setLoading(false);
    }
  }, [query, page, limit]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 350);

    return () => clearTimeout(timer);
  }, [search]);

  const openForm = (list: ContactList | null) => {
    setEditing(list);
    setName(list?.name || "");
    setDescription(list?.description || "");
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      if (editing) {
        await contactService.updateList(editing.id, {
          name: name.trim(),
          description: description.trim() || null,
        });
        toast.success("Contact list updated");
        setFormOpen(false);
        load();
      } else {
        const created = await contactService.createList({
          name: name.trim(),
          description: description.trim() || undefined,
        });
        setFormOpen(false);
        await load();
        // Straight into the upload — an empty list is not the thing anyone
        // came here to make.
        setUploadFor(created);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to save the contact list"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (list: ContactList) => {
    try {
      await contactService.removeList(list.id);
      toast.success(`"${list.name}" deleted`);
      if (open?.id === list.id) setOpen(null);
      load();
    } catch (error) {
      // A 409 here names the campaign still using the list — worth showing in
      // full rather than replacing with "failed to delete".
      toast.error(getApiErrorMessage(error, "Failed to delete the contact list"));
    }
  };

  if (open) {
    return (
      <ContactListDetail
        list={open}
        onBack={() => {
          setOpen(null);
          load();
        }}
        onChanged={load}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search lists"
          className="max-w-sm"
        />

        <Button onClick={() => openForm(null)}>
          <Plus className="mr-2 h-4 w-4" />
          New list
        </Button>
      </div>

      <div className="rounded-md border">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        ) : (
          <ContactListTable
            lists={lists}
            onOpen={setOpen}
            onUpload={setUploadFor}
            onEdit={openForm}
            onDelete={handleDelete}
          />
        )}
      </div>

      <Pagination meta={meta} onPageChange={setPage} onLimitChange={setLimit} />

      <Dialog open={formOpen} onOpenChange={(o) => !saving && setFormOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit contact list" : "New contact list"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Renaming a list does not affect campaigns that already used it."
                : "Name it, then upload a CSV of the people on it."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                autoFocus
                value={name}
                disabled={saving}
                placeholder="e.g. Product Management Summit 2026 — attendees"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Where it came from (optional)</Label>
              <Textarea
                rows={2}
                value={description}
                disabled={saving}
                placeholder="Badge scans from the partner booth, exported 12 Aug"
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {uploadFor && (
        <UploadDialog
          list={uploadFor}
          open={Boolean(uploadFor)}
          onOpenChange={(o) => !o && setUploadFor(null)}
          onUploaded={load}
        />
      )}
    </div>
  );
}
