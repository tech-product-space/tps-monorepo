import { Button } from "@/gradient/components/ui/button";
import { Badge } from "@/gradient/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/gradient/components/ui/dropdown-menu";
import {
  Pencil,
  Trash2,
  MoreHorizontal,
  CalendarClock,
  SendHorizonal,
  X,
  FlaskConical,
} from "lucide-react";
import { Reminder, STATUS_BADGE } from "../../types";

interface ReminderTableProps {
  reminders: Reminder[];
  onEdit: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
  onSchedule: (reminder: Reminder) => void;
  onCancelSchedule: (reminder: Reminder) => void;
  onSendNow: (reminder: Reminder) => void;
  onSendTestEmail: (reminder: Reminder) => void; // ✅ new
}

export default function ReminderTable({
  reminders,
  onEdit,
  onDelete,
  onSchedule,
  onCancelSchedule,
  onSendNow,
  onSendTestEmail,
}: ReminderTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Sender</TableHead>
          <TableHead>Target Status</TableHead>
          <TableHead>Attendee Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Scheduled At</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reminders.map((reminder) => {
          const statusKey = (reminder.status ?? "pending").toLowerCase();
          const badge = STATUS_BADGE[statusKey] ?? {
            label: reminder.status ?? "—",
            variant: "secondary" as const,
          };
          const isProcessing = statusKey === "processing";
          const isSent = statusKey === "sent";
          const isScheduled = statusKey === "scheduled";
          const hasRun = (reminder.totalSent ?? 0) + (reminder.totalFailed ?? 0) > 0;

          return (
            <TableRow key={reminder.id}>
              <TableCell className="font-medium">{reminder.name}</TableCell>
              <TableCell>{reminder.subject}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {reminder.senderEmail}
              </TableCell>
              <TableCell>{reminder.targetStatus || "—"}</TableCell>
              <TableCell>{reminder.targetAttendeeType || "—"}</TableCell>
              <TableCell>
                <Badge variant={badge.variant}>{badge.label}</Badge>
                {hasRun && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {reminder.totalSent ?? 0} sent
                    {(reminder.totalFailed ?? 0) > 0 && (
                      <span className="text-destructive">
                        {" "}
                        · {reminder.totalFailed} failed
                      </span>
                    )}
                  </p>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {reminder.scheduledAt
                  ? new Date(reminder.scheduledAt).toLocaleString()
                  : "—"}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[250px] ">
                    <DropdownMenuItem
                      onClick={() => onEdit(reminder)}
                      disabled={isProcessing}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    {/* Keyed off the status, not off `scheduledAt`: that field
                        outlives the run, so a failed reminder used to offer
                        nothing but "Cancel Schedule" and could not be retried. */}
                    {isScheduled ? (
                      <DropdownMenuItem
                        onClick={() => onCancelSchedule(reminder)}
                        disabled={isProcessing}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Cancel Schedule
                      </DropdownMenuItem>
                    ) : (
                      <>
                        <DropdownMenuItem
                          onClick={() => onSchedule(reminder)}
                          disabled={isProcessing || isSent}
                        >
                          <CalendarClock className="mr-2 h-4 w-4" />
                          Schedule
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          onClick={() => onSendNow(reminder)}
                          disabled={isProcessing || isSent}
                        >
                          <SendHorizonal className="mr-2 h-4 w-4" />
                          Send Now
                        </DropdownMenuItem>
                      </>
                    )}

                    <DropdownMenuItem
                      onClick={() => onSendTestEmail(reminder)}
                      disabled={isProcessing}
                    >
                      <FlaskConical className="mr-2 h-4 w-4" />
                      Send Test Email
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(reminder)}
                      disabled={isProcessing}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
