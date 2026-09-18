"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ILead } from "../../types/leads";
import { Badge } from "@/components/ui/badge";
import { formatDataTime } from "@/utils/formatDataTime";
import { resolveStorageUrl } from "@/lib/stoage";

type Props = {
  lead: ILead | null;
  open: boolean;
  onClose: () => void;
};

const LeadDetailsDialog = ({ lead, open, onClose }: Props) => {
  if (!lead) return null;

  const isScholarship = lead.type === "ai-for-pm-scholarship";
  const data = lead.additionalData || {};

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      {isScholarship ? (
        <DialogContent className="min-w-[70vw] max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b pb-4">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl">
                  Scholarship Application
                </DialogTitle>
                <DialogDescription className="mt-1">
                  Full information for {lead.name}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-8 mt-6">
            {/* CORE INFO SECTION */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-1">
                  Basic Information
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ID</span>
                    <span className="font-medium">#{lead.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium text-primary">
                      {lead.name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium">{lead.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span className="font-medium">
                      {data.country_code ? `${data.country_code} ` : ""}
                      {lead.phone}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-1">
                  System Status
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="outline" className="ml-1">
                      {lead.status || "Not interested"}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Assigned To</span>
                    <span className="font-medium italic text-muted-foreground">
                      {lead.assignedTo || "Not Assigned"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created At</span>
                    <span className="font-medium">
                      {formatDataTime(lead.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* SCHOLARSHIP SPECIFIC PROFESSIONAL INFO */}
            <div className="space-y-4 bg-muted/30 p-4 rounded-xl border">
              <h3 className="text-lg font-semibold">Professional Background</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold">
                    Job Title
                  </label>
                  <p className="font-medium text-lg">
                    {data.current_job_title || "N/A"}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold">
                    Company
                  </label>
                  <p className="font-medium text-lg">
                    {data.current_company || "N/A"}
                  </p>
                </div>
                {data.linkedin && (
                  <div className="md:col-span-2">
                    <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold">
                      LinkedIn Profile
                    </label>
                    <div>
                      <a
                        href={data.linkedin}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline inline-flex items-center gap-1 font-medium"
                      >
                        {data.linkedin}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* WHY SCHOLARSHIP SECTION */}
            {data.why_scholarship && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold border-b pb-1">
                  Why you need this Scholarship?
                </h3>
                <div className="bg-primary/5 p-6 rounded-xl border border-primary/10 italic text-foreground/90 leading-relaxed shadow-sm">
                  "{data.why_scholarship}"
                </div>
              </div>
            )}

            {data.resume && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Resume
                </h3>

                <div className="flex items-center justify-between bg-muted/40 hover:bg-muted/60 transition-colors p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 flex items-center justify-center rounded-md bg-primary/10 text-primary font-semibold">
                      PDF
                    </div>

                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{data.resume}</span>
                    </div>
                  </div>

                  <a
                    href={resolveStorageUrl(data.resume)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Open
                  </a>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      ) : (
        <DialogContent className="min-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lead Details</DialogTitle>
            <DialogDescription>
              Full information for {lead.name}
            </DialogDescription>
          </DialogHeader>

          {/* BASIC INFO */}
          <div className="space-y-4 mt-4">
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">
                Basic Info
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="font-medium">ID:</span> {lead.id}
                </div>
                <div>
                  <span className="font-medium">Name:</span> {lead.name}
                </div>
                <div>
                  <span className="font-medium">Email:</span> {lead.email}
                </div>
                <div>
                  <span className="font-medium">Phone:</span> {lead.phone}
                </div>
                <div>
                  <span className="font-medium">Type:</span>
                  <Badge variant="secondary" className="ml-1">
                    {lead.type}
                  </Badge>
                </div>
                <div>
                  <span className="font-medium">Status:</span>
                  <Badge variant="outline" className="ml-1">
                    {lead.status || "Not interested"}
                  </Badge>
                </div>
                <div>
                  <span className="font-medium">Assigned To:</span>{" "}
                  {lead.assignedTo || "Not Assigned"}
                </div>
              </div>
            </div>

            {/* ADDITIONAL DATA */}
            {lead.additionalData &&
              Object.keys(lead.additionalData).length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm text-muted-foreground mb-2">
                    Additional Information
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(lead.additionalData).map(
                      ([key, value]) =>
                        value && (
                          <div key={key}>
                            <span className="font-medium capitalize">
                              {key.replace(/_/g, " ")}:
                            </span>{" "}
                            {String(value)}
                          </div>
                        ),
                    )}
                  </div>
                </div>
              )}

            {/* TIMESTAMPS */}
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">
                Timestamps
              </h3>
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <span className="font-medium">Created At: </span>{" "}
                  {formatDataTime(lead.createdAt)}
                </div>

                {lead.updatedAt && (
                  <div>
                    <span className="font-medium">Updated At:</span>{" "}
                    {formatDataTime(lead.updatedAt)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
};

export default LeadDetailsDialog;
