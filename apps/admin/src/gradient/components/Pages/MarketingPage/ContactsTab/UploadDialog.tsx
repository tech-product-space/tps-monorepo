"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Button } from "@/gradient/components/ui/button";

import { contactService } from "@/gradient/services/contactService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import type { ContactList, UploadResult } from "@/gradient/types/contact";

interface Props {
  list: ContactList;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
}

/**
 * Upload a CSV into a list.
 *
 * The result screen is the point of this dialog. A contact CSV exported by hand
 * is never clean, so the server imports what it can and reports the rest — and
 * "41 already on this list, 3 had no email address" is the only version of that
 * an admin can act on. A bare "Uploaded" would hide the same information.
 */
export default function UploadDialog({
  list,
  open,
  onOpenChange,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState("");

  const reset = () => {
    setFile(null);
    setResult(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError("");

    try {
      const res = await contactService.upload(list.id, file);
      setResult(res.data);
      onUploaded();

      if (res.data.truncated) toast.warning(res.message);
      else toast.success(res.message);
    } catch (err) {
      // The backend's message names the file's actual columns when it cannot
      // find an email one — far more useful than "upload failed".
      setError(getApiErrorMessage(err, "Failed to upload the file"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (uploading) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload contacts</DialogTitle>
          <DialogDescription>
            Into <b>{list.name}</b>. A CSV with an <code>email</code> column —
            <code> name</code> and <code>phone</code> are used if present, and
            every other column is kept against the contact.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              {result.created.toLocaleString()} contact
              {result.created === 1 ? "" : "s"} added
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Added", value: result.created },
                { label: "Already here", value: result.skipped },
                { label: "No email", value: result.invalid },
              ].map((tile) => (
                <div key={tile.label} className="rounded-md border p-3">
                  <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                    {tile.label}
                  </p>
                  <p className="mt-1 text-xl font-semibold">
                    {tile.value.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            <p className="text-muted-foreground text-xs">
              The list now holds {result.totalInList.toLocaleString()} contacts.
              Rows already on the list were left as they were rather than
              overwritten.
            </p>

            {result.truncated && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  The file was longer than one upload can take. Split the
                  remainder into another file and upload it too.
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <label
              className="hover:bg-muted/40 flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center transition-colors"
              htmlFor="contact-csv"
            >
              <FileUp className="text-muted-foreground h-7 w-7" />
              <span className="text-sm font-medium">
                {file ? file.name : "Choose a CSV file"}
              </span>
              <span className="text-muted-foreground text-xs">
                Up to 1 MB — around 20,000 rows
              </span>
            </label>

            <input
              ref={inputRef}
              id="contact-csv"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setError("");
              }}
            />

            {error && <p className="text-destructive text-xs">{error}</p>}

            {/* The sample is the cheapest way to answer "what should the columns
                be" — quicker than reading the description above and getting a
                400 back. Extra columns in it are deliberate: they demonstrate
                that anything unrecognised is kept, not dropped. */}
            <a
              href="/sample-contacts.csv"
              download="sample-contacts.csv"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs underline underline-offset-2"
            >
              <Download className="h-3.5 w-3.5" />
              Download a sample CSV
            </a>

            <p className="text-muted-foreground text-xs">
              Being on a list is not permission to email someone — anyone who has
              unsubscribed is still skipped when a campaign sends.
            </p>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <>
              <Button variant="outline" onClick={reset}>
                Upload another
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={!file || uploading}>
                {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Upload
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
