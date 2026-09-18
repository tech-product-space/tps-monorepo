"use client";

import { useState } from "react";

import { ResourceLead } from "@/gradient/types/resource";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";

import { Loader2, Mail, Phone, Calendar, Briefcase, Eye } from "lucide-react";

export default function ResourceLeadTable({
  leads,
  loading,
}: {
  leads: ResourceLead[];
  loading: boolean;
}) {
  const [selectedLead, setSelectedLead] = useState<ResourceLead | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="animate-spin h-6 w-6 text-zinc-400" />
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="p-20 text-center">
        <p className="text-zinc-500">No downloads/leads found for this resource.</p>
      </div>
    );
  }

  return (
    <>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
            <th className="px-6 py-4 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
              Contact Details
            </th>
            <th className="px-6 py-4 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
              Job Title
            </th>
            <th className="px-6 py-4 text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
              Date
            </th>
            <th className="px-6 py-4 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr
              key={lead.id}
              className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors"
            >
              <td className="px-6 py-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">
                    {lead.name}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 text-[12px] text-zinc-500">
                      <Mail size={12} />
                      {lead.email}
                    </div>
                    {lead.phone && (
                      <div className="flex items-center gap-2 text-[12px] text-zinc-500">
                        <Phone size={12} />
                        {lead.phone}
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300">
                  <Briefcase size={14} className="text-zinc-400" />
                  {lead.jobTitle}
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2 text-[13px] text-zinc-500">
                  <Calendar size={14} className="text-zinc-400" />
                  {new Date(lead.createdAt).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </td>
              <td className="px-6 py-4">
                <button
                  onClick={() => setSelectedLead(lead)}
                  className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition"
                >
                  <Eye size={16} className="text-zinc-500" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent className="max-w-2xl! w-full! max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lead Details</DialogTitle>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-6 text-sm">

              {/* BASIC INFO */}
              <Section title="Basic Information">
                <Detail label="Name" value={selectedLead.name} />
                <Detail label="Email" value={selectedLead.email} />
                <Detail label="Phone" value={selectedLead.phone} />
                <Detail label="Job Title" value={selectedLead.jobTitle} />
                <Detail
                  label="Created"
                  value={new Date(selectedLead.createdAt).toLocaleString()}
                />
              </Section>

              {/* UTM / ADDITIONAL DATA */}
              {selectedLead.additionalData &&
                Object.keys(selectedLead.additionalData).length > 0 && (
                  <Section title="Tracking Data">
                    {Object.entries(selectedLead.additionalData).map(([key, value]) => (
                      <Detail
                        key={key}
                        label={formatLabel(key)}
                        value={String(value)}
                      />
                    ))}
                  </Section>
                )}

            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h4 className="text-sm font-semibold text-zinc-500">{title}</h4>
      {children}
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium text-right break-all">
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