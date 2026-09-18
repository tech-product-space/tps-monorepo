"use client";

import { Archive, Copy, Pause, Pencil, Play } from "lucide-react";

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
  WORKFLOW_STATUS_LABELS,
  WORKFLOW_STATUS_STYLES,
  type Workflow,
} from "@/gradient/types/workflow";
import { describeTrigger } from "./describeTrigger";

interface Props {
  workflows: Workflow[];
  onOpen: (workflow: Workflow) => void;
  onDuplicate: (workflow: Workflow) => void;
  onArchive: (workflow: Workflow) => void;
  onPause: (workflow: Workflow) => void;
  onResume: (workflow: Workflow) => void;
}

const formatDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

export default function AutomationTable({
  workflows,
  onOpen,
  onDuplicate,
  onArchive,
  onPause,
  onResume,
}: Props) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Trigger</TableHead>
            <TableHead className="text-right">In progress</TableHead>
            <TableHead>Last enrolled</TableHead>
            <TableHead className="w-[160px]" />
          </TableRow>
        </TableHeader>

        <TableBody>
          {workflows.map((workflow) => {
            /**
             * A live workflow that has never enrolled anybody is the row worth
             * looking at — it is the shape a bad trigger filter takes. Flagged
             * here rather than left for someone to notice.
             */
            const neverFired =
              workflow.status === "active" && !workflow.lastRunAt;

            return (
              <TableRow
                key={workflow.id}
                className="cursor-pointer"
                onClick={() => onOpen(workflow)}
              >
                <TableCell className="font-medium">
                  {workflow.name}
                  {workflow.description && (
                    <div className="text-xs text-muted-foreground font-normal mt-0.5 line-clamp-1">
                      {workflow.description}
                    </div>
                  )}
                </TableCell>

                <TableCell>
                  <Badge
                    variant="outline"
                    className={`font-medium ${WORKFLOW_STATUS_STYLES[workflow.status]}`}
                  >
                    {WORKFLOW_STATUS_LABELS[workflow.status]}
                  </Badge>
                </TableCell>

                {/* In words, not "newActivity" — the trigger is the thing an
                    admin is actually scanning this column for. */}
                <TableCell className="text-sm text-muted-foreground max-w-[280px]">
                  {describeTrigger(workflow)}
                </TableCell>

                <TableCell className="text-right tabular-nums">
                  {(workflow.liveEnrollments ?? 0).toLocaleString()}
                </TableCell>

                <TableCell className="text-sm text-muted-foreground">
                  {neverFired ? (
                    <span className="text-amber-700">Nobody yet</span>
                  ) : (
                    formatDateTime(workflow.lastRunAt)
                  )}
                </TableCell>

                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    {workflow.status === "active" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Pause"
                        onClick={() => onPause(workflow)}
                      >
                        <Pause className="h-4 w-4" />
                      </Button>
                    )}

                    {workflow.status === "paused" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Resume"
                        onClick={() => onResume(workflow)}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      title="Edit"
                      onClick={() => onOpen(workflow)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      title="Duplicate"
                      onClick={() => onDuplicate(workflow)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" title="Archive">
                          <Archive className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Archive &ldquo;{workflow.name}&rdquo;?
                          </AlertDialogTitle>
                          {/* States the consequence rather than asking "are you
                              sure" — the enrolments ending is the part nobody
                              expects. */}
                          <AlertDialogDescription>
                            {workflow.liveEnrollments
                              ? `${workflow.liveEnrollments.toLocaleString()} people are part-way through this workflow. Archiving ends their journeys — they will not receive the rest of the emails.`
                              : "It will stop enrolling anybody and move out of the list. Nothing is deleted, and the record of what was already sent is kept."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onArchive(workflow)}>
                            Archive
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
