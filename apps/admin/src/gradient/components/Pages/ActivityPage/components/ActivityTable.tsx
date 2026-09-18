"use client";

import { Fragment } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { Badge } from "@/gradient/components/ui/badge";
import ActivityDiff from "@/gradient/components/Common/ActivityTimeline/ActivityDiff";
import {
  describeActivity,
  formatActivityDate,
  getActorName,
  getEntityHref,
  getEntityLabel,
  getVerb,
  getVerbStyle,
  VERB_LABELS,
} from "@/gradient/constants/activity";
import type { ActivityLog } from "@/gradient/types/activity";

interface Props {
  logs: ActivityLog[];
  loading: boolean;
  expandedId: string | null;
  onToggleExpand: (id: string | null) => void;
}

const ActivityTable = ({
  logs,
  loading,
  expandedId,
  onToggleExpand,
}: Props) => {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-48">When</TableHead>
          <TableHead className="w-45">Who</TableHead>
          <TableHead className="w-32">Action</TableHead>
          <TableHead>What</TableHead>
          <TableHead className="w-28 text-right">Detail</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {loading && logs.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="py-10 text-center">
              Loading activity…
            </TableCell>
          </TableRow>
        )}

        {!loading && logs.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="py-10 text-center">
              No activity matches these filters
            </TableCell>
          </TableRow>
        )}

        {logs.map((log) => {
          const { prefix, target, suffix } = describeActivity(log);
          const href = getEntityHref(log);
          const isOpen = expandedId === log.id;
          const verb = getVerb(log);
          const hasDetail =
            Object.keys(log.changes || {}).length > 0 ||
            Object.keys(log.metadata || {}).length > 0;

          return (
            // The detail row is a sibling <tr>, so each log renders two rows —
            // hence the keyed Fragment rather than a wrapper element.
            <Fragment key={log.id}>
              <TableRow>
                <TableCell className="text-sm whitespace-nowrap text-gray-600">
                  {formatActivityDate(log.createdAt)}
                </TableCell>

                <TableCell>
                  <div className="font-medium">{getActorName(log)}</div>
                  {log.actorRole && (
                    <div className="text-xs text-gray-500">{log.actorRole}</div>
                  )}
                </TableCell>

                <TableCell>
                  <Badge className={getVerbStyle(log)}>
                    {VERB_LABELS[verb] || verb}
                  </Badge>
                  {log.status === "failure" && (
                    <Badge className="ml-1 bg-red-100 text-red-700">
                      failed
                    </Badge>
                  )}
                </TableCell>

                <TableCell>
                  <div className="text-sm">
                    <span className="text-gray-600">{prefix}</span>{" "}
                    {target &&
                      (href ? (
                        <Link
                          href={href}
                          className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
                        >
                          {target}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-900">
                          {target}
                        </span>
                      ))}
                    {suffix && (
                      <span className="text-gray-600">{suffix}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {getEntityLabel(log.entityType)}
                  </div>
                </TableCell>

                <TableCell className="text-right">
                  {hasDetail ? (
                    <button
                      type="button"
                      onClick={() => onToggleExpand(isOpen ? null : log.id)}
                      className="inline-flex cursor-pointer items-center gap-1 text-sm text-blue-600 hover:underline"
                    >
                      {isOpen ? "Hide" : "View"}
                      <ChevronDown
                        className={`h-3 w-3 transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </TableCell>
              </TableRow>

              {isOpen && (
                <TableRow key={`${log.id}-detail`} className="bg-gray-50">
                  <TableCell colSpan={5} className="py-4">
                    <ActivityDiff
                      changes={log.changes}
                      metadata={log.metadata}
                    />

                    {/* The request facts, for the rare "which call was this?" */}
                    <p className="mt-3 border-t pt-2 font-mono text-xs text-gray-400">
                      {log.method} {log.path}
                      {log.statusCode ? ` · ${log.statusCode}` : ""}
                      {log.ipAddress ? ` · ${log.ipAddress}` : ""}
                    </p>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
};

export default ActivityTable;
