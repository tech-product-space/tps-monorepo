"use client";

import { Download, ExternalLink } from "lucide-react";

import { Button } from "@/gradient/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";

interface CertificatePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Object URL of the rendered PDF. Owned by the caller. */
  url: string | null;
}

/**
 * Show the rendered PDF in place.
 *
 * It used to be `window.open` — which every browser blocks, because by the time
 * the render comes back the click that asked for it is long over and the call
 * no longer counts as user-initiated. The admin got a silent nothing. The links
 * below are real clicks, so they still work for anyone who wants a tab.
 */
export default function CertificatePreviewDialog({
  open,
  onOpenChange,
  url,
}: CertificatePreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,1100px)] gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="p-4 pb-3 text-left">
          <DialogTitle className="text-sm">Certificate preview</DialogTitle>
          <DialogDescription className="text-xs">
            Rendered on the server with sample data, exactly as a recipient
            would receive it.
          </DialogDescription>
        </DialogHeader>

        <div className="h-[70vh] border-y border-border bg-muted">
          {url && (
            <iframe
              src={url}
              title="Certificate preview"
              className="h-full w-full"
            />
          )}
        </div>

        <DialogFooter className="p-3">
          {url && (
            <>
              <Button variant="outline" size="sm" asChild>
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in a new tab
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={url} download="certificate-preview.pdf">
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
