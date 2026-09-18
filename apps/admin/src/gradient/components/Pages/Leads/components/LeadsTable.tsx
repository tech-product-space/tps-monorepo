"use client";

import { useState, ReactNode } from "react";
import { Lead, LeadStatus } from "@/gradient/types/lead";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";

import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";

import { resolveStorageUrl } from "../../../../lib/storage";

import { Eye } from "lucide-react";
import { cn } from "@/gradient/lib/utils";

const statusVariant: Record<LeadStatus, string> = {
  new: "bg-blue-100 text-blue-700",
  contacted: "bg-yellow-100 text-yellow-700",
  qualified: "bg-purple-100 text-purple-700",
  converted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  duplicate: "bg-gray-100 text-gray-600",
};

interface Props {
  leads: Lead[];
  showSource?: boolean;
  showSubSource?: boolean;
}

const LeadsTable = ({
  leads,
  showSource = true,
  showSubSource = true,
}: Props) => {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>

            {showSource && <TableHead>Source</TableHead>}
            {showSubSource && <TableHead>Sub Source</TableHead>}

            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-15" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {leads.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center py-10">
                No leads found
              </TableCell>
            </TableRow>
          )}

          {leads.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell className="font-medium">{lead.name}</TableCell>

              <TableCell>{lead.email || "-"}</TableCell>

              <TableCell>
                {lead.countryCode} {lead.phone}
              </TableCell>

              {showSource && (
                <TableCell>{lead.sourceDisplayName || lead.source}</TableCell>
              )}

              {showSubSource && (
                <TableCell>{lead.subSourceDisplayName || "-"}</TableCell>
              )}

              <TableCell>
                <Badge className={statusVariant[lead.status]}>
                  {lead.status}
                </Badge>
              </TableCell>

              <TableCell>
                {new Date(lead.createdAt).toLocaleDateString()}
              </TableCell>

              <TableCell>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSelectedLead(lead)}
                >
                  <Eye size={16} />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* DETAILS DIALOG */}
      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent className="max-w-3xl! w-full! max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lead Details</DialogTitle>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-6 text-sm">
              {/* BASIC INFO */}
              <Section title="Basic Information">
                <Detail label="Name" value={selectedLead.name} />
                <Detail label="Email" value={selectedLead.email} />
                <Detail
                  label="Phone"
                  value={`${selectedLead.countryCode ?? ""} ${selectedLead.phone ?? ""}`}
                />
                <Detail label="Status" value={selectedLead.status} />
                <Detail
                  label="Created"
                  value={new Date(selectedLead.createdAt).toLocaleString()}
                />
              </Section>

              {/* ADDITIONAL DATA */}
              {selectedLead.additionalData &&
                Object.keys(selectedLead.additionalData).length > 0 && (
                  <Section title="Additional Data">
                    {Object.entries(selectedLead.additionalData).map(
                      ([key, value]) => {
                        if (key === "resumeKey" && value) {
                          const url = resolveStorageUrl(value);

                          return (
                            <Detail
                              key={key}
                              label={formatLabel(key)}
                              value={
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    color: "#2563eb",
                                    textDecoration: "none",
                                    cursor: "pointer",
                                  }}
                                  onMouseEnter={(e) =>
                                    (e.currentTarget.style.textDecoration =
                                      "underline")
                                  }
                                  onMouseLeave={(e) =>
                                    (e.currentTarget.style.textDecoration =
                                      "none")
                                  }
                                >
                                  View Resume
                                </a>
                              }
                            />
                          );
                        }

                        return (
                          <Detail
                            key={key}
                            label={formatLabel(key)}
                            value={String(value)}
                          />
                        );
                      },
                    )}
                  </Section>
                )}

              {/* SOURCE */}
              <Section title="Source">
                <Detail
                  label="Source"
                  value={selectedLead.sourceDisplayName || selectedLead.source}
                />
                <Detail
                  label="Sub Source"
                  value={selectedLead.subSourceDisplayName}
                />
                <Detail label="Page URL" value={selectedLead.pageUrl} />
                <Detail label="Referrer" value={selectedLead.referrer} />
              </Section>

              {/* UTM ATTRIBUTION */}
              <Section title="UTM Attribution">
                <Detail label="UTM ID" value={selectedLead.utmId} />
                <Detail label="UTM Source" value={selectedLead.utmSource} />
                <Detail label="UTM Medium" value={selectedLead.utmMedium} />
                <Detail label="UTM Campaign" value={selectedLead.utmCampaign} />
                <Detail label="UTM Term" value={selectedLead.utmTerm} />
                <Detail label="UTM Content" value={selectedLead.utmContent} />
              </Section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default LeadsTable;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h4 className="text-sm font-semibold text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium text-right break-all")}>
        {value || "-"}
      </span>
    </div>
  );
}

function formatLabel(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase());
}
