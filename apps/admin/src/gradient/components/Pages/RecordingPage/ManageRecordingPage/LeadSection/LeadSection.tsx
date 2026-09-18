"use client";

import { Loader2, Mail, RefreshCcw, Search, SearchX } from "lucide-react";

import { Badge } from "@/gradient/components/ui/badge";

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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/gradient/components/ui/card";
import Pagination, { IPaginationMeta } from "@/gradient/components/ui/custom/Pagination";
import { DownloadExcelButton } from "@/gradient/components/ui/custom/DownloadCsvButton";

import { recordingService } from "@/gradient/services/recordingService";
import { RecordingLead, RecordingResponse } from "@/gradient/types/recording";

interface Props {
  recording: RecordingResponse;
  leads: RecordingLead[];
  meta: IPaginationMeta;
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  refetch: () => void;
}

/**
 * Who passed the gate.
 *
 * The columns here track what the gate actually collects, and nothing else.
 * When it asked for an email alone this was two columns wide; it now renders
 * `EventDetailsForm`, so name, phone, attendee type and the role-or-college
 * pair are real and earn their place back.
 *
 * Two things still deliberately absent:
 *
 *   UTM source        no submission has ever carried one
 *   the repeat count  it counts re-passes of the gate, which happen when
 *                     somebody opens the page on a second device — a fact about
 *                     browsers, not about people, and reading it as engagement
 *                     is the mistake it invites
 *
 * **Role and college share one column.** The form makes exactly one of them
 * required depending on the attendee toggle, so a row can only ever have one;
 * two columns would guarantee that half of each was empty. The attendee type
 * beside it says which one is being shown.
 */
const formatDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export default function LeadSection({
  recording,
  leads,
  meta,
  loading,
  search,
  onSearchChange,
  onPageChange,
  refetch,
}: Props) {
  const searching = search.trim().length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Leads</CardTitle>
          <CardDescription>
            {searching
              ? `${meta.total} ${meta.total === 1 ? "address" : "addresses"} matching “${search.trim()}”`
              : `${meta.total} ${meta.total === 1 ? "person" : "people"} gave an email to watch this`}
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          <DownloadExcelButton
            filename={`${recording.slug}-leads`}
            fetchPage={(page: number, limit: number) =>
              recordingService
                .getRecordingLeads(recording.id, page, limit)
                .then((res) => ({ data: res.data, meta: res.meta }))
            }
            variant="outline"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={refetch}
            disabled={loading}
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Server-side and partial, so typing a domain finds everybody from one
            company. Only shown once there is something to search through —
            a filter over an empty table is furniture. */}
        {(searching || meta.total > 0) && (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by email…"
              className="pl-9"
            />
          </div>
        )}

        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Role / College</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Watched on</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading leads...
                    </div>
                  </TableCell>
                </TableRow>
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    {/* Three different nothings. An empty table looks the same
                        whether nobody watched, nobody could, or the search
                        simply missed — and the fix differs in each case. */}
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      {searching ? (
                        <>
                          <SearchX className="h-6 w-6" />
                          No address matches “{search.trim()}”.
                        </>
                      ) : !recording.isPublished ? (
                        <>
                          <Mail className="h-6 w-6" />
                          Nobody yet — this recording is still a draft, so the
                          page cannot be reached.
                        </>
                      ) : (
                        <>
                          <Mail className="h-6 w-6" />
                          Nobody has watched this recording yet.
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">
                      {lead.name ?? (
                        <span className="font-normal text-muted-foreground">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.linkedinUrl ? (
                        <a
                          href={lead.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 hover:text-foreground"
                          title="Open LinkedIn profile"
                        >
                          {lead.email}
                        </a>
                      ) : (
                        lead.email
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {lead.phone ? (
                        // The country code is stored separately, so a bare
                        // number is ambiguous the moment anybody is not in +91.
                        `${lead.countryCode ?? ""} ${lead.phone}`.trim()
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.attendeeType ? (
                        <Badge variant="secondary">{lead.attendeeType}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      {/* One column, because the form fills exactly one of the
                          two. A student's graduation year rides along with the
                          college, where it means something. */}
                      {lead.attendeeType === "Student" ? (
                        lead.collegeName ? (
                          <span className="block truncate">
                            {lead.collegeName}
                            {lead.graduationYear && (
                              <span className="text-muted-foreground">
                                {" · "}
                                {lead.graduationYear}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )
                      ) : lead.jobTitle ? (
                        <span className="block truncate">{lead.jobTitle}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {/* Whether this row is a fresh answer or a copy.
                          "Watched on" is when they opened this recording;
                          this is when a human last typed what is in the row,
                          and for a carried lead the two are weeks apart. */}
                      {lead.source === "carried" ? (
                        <span className="text-muted-foreground">
                          Carried
                          {lead.detailsConfirmedAt && (
                            <> · {formatDate(lead.detailsConfirmedAt)}</>
                          )}
                        </span>
                      ) : (
                        <Badge variant="outline">Filled in</Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(lead.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination
          meta={meta}
          onPageChange={onPageChange}
          onLimitChange={() => {}}
        />
      </CardContent>
    </Card>
  );
}
