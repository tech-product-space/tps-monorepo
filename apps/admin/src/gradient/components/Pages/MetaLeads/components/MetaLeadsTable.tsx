"use client";

import { Badge } from "@/gradient/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { cn } from "@/gradient/lib/utils";
import {
  META_LEAD_STATUS_LABELS,
  type MetaLead,
  type MetaLeadStatus,
} from "@/gradient/types/meta";
import { ArrowDown, ArrowUp, PhoneOff } from "lucide-react";

/** Muted, not red: a skipped lead is a form misconfiguration, not an error. */
const STATUS_STYLES: Record<MetaLeadStatus, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  contacted: "bg-amber-50 text-amber-700 border-amber-200",
  qualified: "bg-violet-50 text-violet-700 border-violet-200",
  converted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  duplicate: "bg-slate-100 text-slate-600 border-slate-200",
  skipped: "bg-slate-50 text-slate-500 border-dashed border-slate-300",
};

type SortKey = "sourceCreatedAt" | "createdAt" | "name" | "status";

interface Props {
  leads: MetaLead[];
  loading: boolean;
  sortBy: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  onSelect: (lead: MetaLead) => void;
}

const formatReceived = (value: string) => {
  const date = new Date(value);

  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Hoisted out of the table body deliberately.
 *
 * Declaring it inside the component makes it a *new component type* on every
 * render, so React unmounts and remounts each header rather than updating it —
 * which throws away focus mid-interaction.
 */
const SortHeader = ({
  column,
  label,
  sortBy,
  sortDir,
  onSort,
}: {
  column: SortKey;
  label: string;
  sortBy: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) => (
  <button
    type="button"
    onClick={() => onSort(column)}
    className="inline-flex items-center gap-1 font-medium hover:text-foreground"
  >
    {label}
    {sortBy === column &&
      (sortDir === "asc" ? (
        <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowDown className="h-3 w-3" />
      ))}
  </button>
);

const MetaLeadsTable = ({
  leads,
  loading,
  sortBy,
  sortDir,
  onSort,
  onSelect,
}: Props) => {
  const sortProps = { sortBy, sortDir, onSort };

  if (!loading && leads.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        No Facebook leads match these filters.
      </div>
    );
  }

  return (
    /*
      Scrolls in both directions inside its own box.

      Horizontally because the row is wider than a laptop viewport once source
      and creative are both shown; vertically so a page of 50 leads does not
      push the pagination controls off the bottom of the screen. The header is
      sticky against the vertical scroll — a table of "—" cells with no visible
      column names is unreadable.
    */
    <div className="max-h-[65vh] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_var(--border)]">
          <TableRow>
            <TableHead>
              <SortHeader column="name" label="Name" {...sortProps} />
            </TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Form</TableHead>
            {/* The lead's own frozen copy, not a join to meta_forms — remapping
                the form must not rewrite what this row says it arrived as. */}
            <TableHead>Source</TableHead>
            <TableHead>Campaign</TableHead>
            <TableHead>Ad set</TableHead>
            <TableHead>Ad</TableHead>
            <TableHead>
              <SortHeader column="status" label="Status" {...sortProps} />
            </TableHead>
            <TableHead className="text-right">
              {/* Facebook's timestamp, not our import time — they differ by
                  years on a backfilled row. */}
              <SortHeader
                column="sourceCreatedAt"
                label="Received"
                {...sortProps}
              />
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody className={cn(loading && "opacity-50")}>
          {leads.map((lead) => (
            <TableRow
              key={lead.id}
              onClick={() => onSelect(lead)}
              className="cursor-pointer"
            >
              <TableCell className="font-medium">
                {lead.name || (
                  <span className="text-muted-foreground italic">No name</span>
                )}
              </TableCell>

              <TableCell className="text-sm">
                {lead.email || lead.phone ? (
                  <div className="space-y-0.5">
                    {lead.email && <div>{lead.email}</div>}
                    {lead.phone && (
                      <div className="text-muted-foreground">
                        {lead.countryCode ? `${lead.countryCode} ` : ""}
                        {lead.phone}
                      </div>
                    )}
                  </div>
                ) : (
                  // The whole reason `skipped` exists as a status — the ad spend
                  // happened, but the form collected nothing to reach them with.
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <PhoneOff className="h-3.5 w-3.5" />
                    No contact details
                  </span>
                )}
              </TableCell>

              <TableCell className="text-sm whitespace-nowrap">
                {lead.formName || "—"}
              </TableCell>

              <TableCell className="text-sm whitespace-nowrap">
                {lead.sourceDisplayName || lead.source || "—"}

                {/*
                  Gated on the key, not the label.

                  When a form has no sub source mapped, ingestion still fills
                  `subSourceDisplayName` with the form name as a best-effort
                  label — so keying off the label would print the form name
                  here, directly beside the Form column already showing it, and
                  imply a sub source you cannot filter by because there isn't
                  one.
                */}
                {lead.subSource && (
                  <div className="text-xs text-muted-foreground">
                    {lead.subSourceDisplayName || lead.subSource}
                  </div>
                )}
              </TableCell>

              <TableCell className="text-sm">{lead.campaignName || "—"}</TableCell>
              <TableCell className="text-sm">{lead.adsetName || "—"}</TableCell>
              <TableCell className="text-sm">{lead.adName || "—"}</TableCell>

              <TableCell>
                <Badge
                  variant="outline"
                  className={cn("font-normal", STATUS_STYLES[lead.status])}
                >
                  {META_LEAD_STATUS_LABELS[lead.status]}
                </Badge>
              </TableCell>

              <TableCell className="text-right text-sm whitespace-nowrap">
                {formatReceived(lead.sourceCreatedAt)}
                {lead.importedVia === "backfill" && (
                  <div className="text-[11px] text-muted-foreground">
                    imported later
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default MetaLeadsTable;
