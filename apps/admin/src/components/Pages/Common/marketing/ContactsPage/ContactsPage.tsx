"use client";

import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import { useNotification } from "@/helpers/NotificationContext";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { HoverLoading } from "@/components/Common/Loading/HoverLoading";

import {
  Upload,
  Users,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Plus,
  FileText,
} from "lucide-react";
import {
  ContactDetail,
  ContactList,
  contactService,
} from "@/services/contact/contactService";
import ContactListTable from "./ContactListTable/ContactListTable";
import ContactDetailTable from "./ContactDetailTable/ContactDetailTable";

const PAGE_SIZE = 50;

export default function ContactsPage() {
  // ─── Contact List State ───────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);

  // ─── Detail View State ────────────────────────────────────────────────────
  const [selectedList, setSelectedList] = useState<ContactList | null>(null);
  const [contacts, setContacts] = useState<ContactDetail[]>([]);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [contactsPage, setContactsPage] = useState(0); // 0-indexed
  const [detailLoading, setDetailLoading] = useState(false);

  // ─── Upload Dialog State ──────────────────────────────────────────────────
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [listName, setListName] = useState("");
  const [uploading, setUploading] = useState(false);

  const { showNotification } = useNotification();

  // ─── Fetch contact lists on mount ─────────────────────────────────────────
  useEffect(() => {
    fetchContactLists();
  }, []);

  const fetchContactLists = async () => {
    setLoading(true);
    try {
      const data = await contactService.getContactLists();
      setContactLists(data);
    } catch {
      showNotification("error", "Failed to load contact lists");
    } finally {
      setLoading(false);
    }
  };

  // ─── Fetch contacts when a list is selected or page changes ───────────────
  useEffect(() => {
    if (!selectedList) return;
    fetchContacts(selectedList.id, contactsPage);
  }, [selectedList, contactsPage]);

  const fetchContacts = async (listId: string, page: number) => {
    setDetailLoading(true);
    try {
      const data = await contactService.getContactsByListId(listId, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setContacts(data.contacts);
      setContactsTotal(data.total);
    } catch {
      showNotification("error", "Failed to load contacts", "error");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelectList = (list: ContactList) => {
    setSelectedList(list);
    setContactsPage(0);
    setContacts([]);
  };

  const handleBack = () => {
    setSelectedList(null);
    setContacts([]);
    setContactsPage(0);
  };

    // ─── Upload logic ─────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!uploadFile || (!selectedList && !listName.trim())) {
      showNotification(
        "error",
        "Please provide a list name and CSV file",
        "error",
      );
      return;
    }

    setUploading(true);
    try {
      let result;
      if (selectedList) {
        result = await contactService.uploadContactsToList(
          uploadFile,
          selectedList.id,
        );
      } else {
        result = await contactService.uploadContacts(
          uploadFile,
          listName.trim(),
        );
      }

      showNotification(
        "success",
        `Uploaded successfully! ${result.summary?.success ?? 0} contacts added.`,
      );
      setUploadOpen(false);
      setUploadFile(null);
      if (!selectedList) setListName("");

      if (selectedList) {
        // Refresh contacts for the selected list
        fetchContacts(selectedList.id, contactsPage);
      } else {
        fetchContactLists(); // refresh list
      }
    } catch {
      showNotification("error", "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDialogClose = (open: boolean) => {
    if (!uploading) {
      setUploadOpen(open);
      if (!open) {
        setUploadFile(null);
        setListName("");
      }
    }
  };

  // ─── Pagination helpers ───────────────────────────────────────────────────
  const totalPages = Math.ceil(contactsTotal / PAGE_SIZE);
  const canPrev = contactsPage > 0;
  const canNext = contactsPage < totalPages - 1;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="px-5 h-16 flex items-center justify-between border-b sticky top-0 bg-white z-10">
        <div className="flex items-center gap-2">
          <SidebarTrigger size="lg" />
          {selectedList ? (
            <>
              <button
                onClick={handleBack}
                className="ml-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Contact List</span>
              </button>
              <span className="text-gray-300 mx-1">/</span>
              <h1 className="text-lg font-semibold text-gray-800">
                {selectedList.name}
              </h1>
              <Badge variant="secondary" className="ml-2">
                {contactsTotal} contacts
              </Badge>
            </>
          ) : (
            <h1 className="ml-4 text-lg font-semibold text-gray-800">
              Contact List
            </h1>
          )}
        </div>

                {/* Upload button */}
        <Button
          size="sm"
          onClick={() => {
            if (selectedList) {
              setListName(selectedList.name);
            }
            setUploadOpen(true);
          }}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {selectedList ? "Add Contacts" : "Upload CSV"}
        </Button>
      </div>

      {/* Body */}
      <div className="p-5 overflow-auto flex-1">
        {/* ── LIST VIEW ── */}
        {!selectedList && (
          <>
            {loading ? (
              <HoverLoading title="Loading..." />
            ) : contactLists.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
                <Users className="w-12 h-12 opacity-30" />
                <p className="text-sm">
                  No contact lists yet. Upload a CSV to get started.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUploadOpen(true)}
                  className="mt-2"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload CSV
                </Button>
              </div>
            ) : (
              <ContactListTable
                contactLists={contactLists}
                onSelectList={handleSelectList}
              />
            )}
          </>
        )}

        {/* ── DETAIL VIEW ── */}
        {selectedList && (
          <>
            {detailLoading ? (
              <HoverLoading title="Loading contacts..." />
            ) : contacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
                <FileText className="w-12 h-12 opacity-30" />
                <p className="text-sm">No contacts found in this list.</p>
              </div>
            ) : (
              <>
                <ContactDetailTable
                  contacts={contacts}
                  contactsPage={contactsPage}
                  pageSize={PAGE_SIZE}
                />

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
                    <span>
                      Showing {contactsPage * PAGE_SIZE + 1}–
                      {Math.min((contactsPage + 1) * PAGE_SIZE, contactsTotal)}{" "}
                      of {contactsTotal}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canPrev}
                        onClick={() => setContactsPage((p) => p - 1)}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span>
                        Page {contactsPage + 1} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canNext}
                        onClick={() => setContactsPage((p) => p + 1)}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

            {/* ── UPLOAD DIALOG ── */}
      <Dialog open={uploadOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedList ? "Add Contacts" : "Upload Contact List"}
            </DialogTitle>
            <DialogDescription>
              {selectedList ? (
                <>
                  Add more contacts to{" "}
                  <span className="font-semibold">{selectedList.name}</span>.
                </>
              ) : (
                "Provide a name for the list and upload a CSV file with columns:"
              )}{" "}
              <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                name, email, phone
              </code>
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 mt-2">
            {/* List Name */}
            {!selectedList && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="listName">List Name</Label>
                <Input
                  id="listName"
                  placeholder="e.g. Summer Campaign 2025"
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  disabled={uploading}
                />
              </div>
            )}

            {/* File input */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="csvFile">CSV File</Label>
              <Input
                id="csvFile"
                type="file"
                accept=".csv"
                disabled={uploading}
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
              {uploadFile && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-2">
              <Button
                variant="outline"
                onClick={() => handleDialogClose(false)}
                disabled={uploading}
              >
                Cancel
              </Button>
                            <Button
                onClick={handleUpload}
                disabled={
                  uploading || !uploadFile || (!selectedList && !listName.trim())
                }
              >
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Uploading...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    Upload
                  </span>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
