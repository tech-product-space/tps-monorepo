"use client";

import {
  Subscriber,
  SubscriberStatus,
  SUBSCRIBER_SOURCE_LABELS,
} from "@/gradient/types/subscriber";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/gradient/components/ui/tooltip";

import { Badge } from "@/gradient/components/ui/badge";

const statusVariant: Record<SubscriberStatus, string> = {
  active: "bg-green-100 text-green-700",
  unsubscribed: "bg-gray-100 text-gray-600",
};

interface Props {
  subscribers: Subscriber[];
}

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : "—";

const SubscribersTable = ({ subscribers }: Props) => {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Added</TableHead>
          <TableHead>Unsubscribed</TableHead>
          <TableHead>Reason</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {subscribers.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center py-10">
              No subscribers found
            </TableCell>
          </TableRow>
        )}

        {subscribers.map((subscriber) => (
          <TableRow key={subscriber.id}>
            <TableCell className="font-medium">
              {subscriber.email}
              {subscriber.name && (
                <span className="block text-xs text-muted-foreground">
                  {subscriber.name}
                </span>
              )}
            </TableCell>

            <TableCell>
              {SUBSCRIBER_SOURCE_LABELS[subscriber.source] ||
                subscriber.source ||
                "—"}
            </TableCell>

            <TableCell>
              <Badge className={statusVariant[subscriber.status]}>
                {subscriber.status}
              </Badge>
            </TableCell>

            <TableCell>{formatDate(subscriber.createdAt)}</TableCell>

            <TableCell>{formatDate(subscriber.unsubscribedAt)}</TableCell>

            {/* Reasons are free text and can run long. Truncated to keep the
                row height stable, with the full text on hover. */}
            <TableCell className="max-w-[260px]">
              {subscriber.unsubscribeReason ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="block truncate text-muted-foreground cursor-default">
                      {subscriber.unsubscribeReason}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm whitespace-pre-wrap">
                    {subscriber.unsubscribeReason}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default SubscribersTable;
