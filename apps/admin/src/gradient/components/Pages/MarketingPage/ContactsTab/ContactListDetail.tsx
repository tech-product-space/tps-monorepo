"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import Pagination from "@/gradient/components/ui/custom/Pagination";

import { contactService } from "@/gradient/services/contactService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import type { Contact, ContactList } from "@/gradient/types/contact";
import type { IPaginationMeta } from "@/gradient/types/pagination";

import UploadDialog from "./UploadDialog";

interface Props {
  list: ContactList;
  onBack: () => void;
  onChanged: () => void;
}

const EMPTY_META: IPaginationMeta = {
  total: 0,
  page: 1,
  limit: 10,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

/**
 * The people on one list.
 *
 * A table rather than a second page, because a contact list is only ever looked
 * at to answer "did that upload work" and "is so-and-so on here" — both of
 * which are a search box and a count.
 */
export default function ContactListDetail({ list, onBack, onChanged }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [meta, setMeta] = useState<IPaginationMeta>(EMPTY_META);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await contactService.contacts(list.id, {
        search: query || undefined,
        page,
        limit,
      });
      setContacts(res.data || []);
      if (res.meta) setMeta(res.meta);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load contacts"));
    } finally {
      setLoading(false);
    }
  }, [list.id, query, page, limit]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounced so a search does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 350);

    return () => clearTimeout(timer);
  }, [search]);

  const handleRemove = async (contact: Contact) => {
    try {
      await contactService.removeContact(list.id, contact.id);
      toast.success(`${contact.email} removed from this list`);
      load();
      onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to remove the contact"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold">{list.name}</h2>
            <p className="text-muted-foreground text-xs">
              {meta.total.toLocaleString()} contact
              {meta.total === 1 ? "" : "s"}
              {list.description ? ` · ${list.description}` : ""}
            </p>
          </div>
        </div>

        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Upload CSV
        </Button>
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, email or phone"
        className="max-w-sm"
      />

      <div className="rounded-md border">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Other columns</TableHead>
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {contacts.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-muted-foreground py-12 text-center"
                  >
                    {query
                      ? "Nobody on this list matches that."
                      : "This list is empty. Upload a CSV to fill it."}
                  </TableCell>
                </TableRow>
              )}

              {contacts.map((contact) => {
                const extras = Object.entries(contact.additionalData || {});

                return (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium">
                      {contact.name || "—"}
                    </TableCell>
                    <TableCell>{contact.email}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {contact.phone || "—"}
                    </TableCell>

                    {/* The interesting column in a real contact CSV is usually
                        the fourth one — company, cohort, ticket type — so it is
                        shown rather than silently kept in the database. */}
                    <TableCell className="text-muted-foreground max-w-[280px] truncate text-xs">
                      {extras.length
                        ? extras.map(([k, v]) => `${k}: ${v}`).join(" · ")
                        : "—"}
                    </TableCell>

                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Remove from this list"
                        onClick={() => handleRemove(contact)}
                      >
                        <Trash2 className="text-destructive h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Pagination meta={meta} onPageChange={setPage} onLimitChange={setLimit} />

      <p className="text-muted-foreground text-xs">
        Removing someone here takes them off this list only. It does not stop
        them being emailed — they may be reachable through several other
        audiences, and unsubscribing is the only thing that stops all of them.
      </p>

      <UploadDialog
        list={list}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={() => {
          load();
          onChanged();
        }}
      />
    </div>
  );
}
