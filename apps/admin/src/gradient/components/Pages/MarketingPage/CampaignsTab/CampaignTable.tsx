"use client";

import { Copy, Pencil, Trash2 } from "lucide-react";

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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/gradient/components/ui/alert-dialog";

import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_STYLES,
  type Campaign,
} from "@/gradient/types/campaign";

interface Props {
  campaigns: Campaign[];
  onOpen: (campaign: Campaign) => void;
  onDuplicate: (campaign: Campaign) => void;
  onDelete: (campaign: Campaign) => void;
}

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

/**
 * "Delivered / queued" is the one derived column here, so the table answers
 * "did that one work" without anybody opening it.
 */
const deliveryLabel = (campaign: Campaign) => {
  if (campaign.status === "draft" || campaign.status === "scheduled") return "—";
  if (!campaign.totalRecipients) return "—";

  return `${campaign.totalSent.toLocaleString()} / ${campaign.totalRecipients.toLocaleString()}`;
};

export default function CampaignTable({
  campaigns,
  onOpen,
  onDuplicate,
  onDelete,
}: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Delivered</TableHead>
          <TableHead>Failed</TableHead>
          <TableHead>Scheduled / sent</TableHead>
          <TableHead>Created by</TableHead>
          <TableHead className="w-[150px]">Actions</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {campaigns.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-muted-foreground py-12 text-center">
              No campaigns yet. Create one to get started.
            </TableCell>
          </TableRow>
        )}

        {campaigns.map((campaign) => (
          <TableRow
            key={campaign.id}
            className="hover:bg-muted/40 cursor-pointer"
            onClick={() => onOpen(campaign)}
          >
            <TableCell className="font-medium">
              {campaign.name}
              {campaign.subject && (
                <span className="text-muted-foreground block max-w-[320px] truncate text-xs">
                  {campaign.subject}
                </span>
              )}
            </TableCell>

            <TableCell>
              <Badge
                variant="outline"
                className={`font-medium ${CAMPAIGN_STATUS_STYLES[campaign.status]}`}
              >
                {CAMPAIGN_STATUS_LABELS[campaign.status]}
              </Badge>
            </TableCell>

            <TableCell>{deliveryLabel(campaign)}</TableCell>

            <TableCell>
              {campaign.totalFailed > 0 ? (
                <span className="text-destructive font-medium">
                  {campaign.totalFailed.toLocaleString()}
                </span>
              ) : (
                "—"
              )}
            </TableCell>

            <TableCell className="text-muted-foreground text-sm">
              {formatDateTime(campaign.sentAt || campaign.scheduledAt)}
            </TableCell>

            <TableCell className="text-muted-foreground text-sm">
              {campaign.createdAdmin?.name || "—"}
            </TableCell>

            {/* Row click opens the editor, so the buttons must not also fire it. */}
            <TableCell onClick={(e) => e.stopPropagation()}>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => onOpen(campaign)}>
                  <Pencil className="h-4 w-4" />
                </Button>

                {/* The only way to change a sent campaign, and the fastest way
                    to repeat one — so it is available from every status. */}
                <Button
                  variant="ghost"
                  size="icon"
                  title="Duplicate"
                  onClick={() => onDuplicate(campaign)}
                >
                  <Copy className="h-4 w-4" />
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={campaign.status === "processing"}
                      title={
                        campaign.status === "processing"
                          ? "Cannot delete while sending"
                          : undefined
                      }
                    >
                      <Trash2 className="text-destructive h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>

                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete campaign</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes <b>{campaign.name}</b>
                        {campaign.status === "sent"
                          ? " and the record of who received it."
                          : "."}{" "}
                        This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onDelete(campaign)}
                        className="bg-destructive hover:bg-destructive/90 text-white"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
