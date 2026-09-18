import { useState } from "react";
import { Loader2, Users, ChevronDown, Check, Briefcase, GraduationCap, X } from "lucide-react";
import { Button } from "@/gradient/components/ui/button";
import { eventService } from "@/gradient/services/eventService";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/gradient/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/gradient/components/ui/alert-dialog";

interface BulkActionsProps {
  eventId: string;
  pendingCount: number;
  fetchRegistrations: () => void;
}

export default function BulkActions({
  eventId,
  pendingCount,
  fetchRegistrations,
}: BulkActionsProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    status: string;
    attendeeType: string;
  }>({
    isOpen: false,
    status: "",
    attendeeType: "",
  });

  const handleBulkActionClick = (status: string, attendeeType: string) => {
    setConfirmDialog({ isOpen: true, status, attendeeType });
  };

  const executeBulkUpdate = async () => {
    const { status, attendeeType } = confirmDialog;
    setConfirmDialog({ isOpen: false, status: "", attendeeType: "" });

    setIsUpdating(true);
    const toastId = toast.loading("Updating status...");
    try {
      const res = await eventService.bulkUpdateStatus(
        eventId,
        status,
        attendeeType,
      );
      toast.success(res.message || "Status updated successfully", {
        id: toastId,
      });
      fetchRegistrations();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to update status", {
        id: toastId,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const getConfirmationMessage = () => {
    const { status, attendeeType } = confirmDialog;
    const action = status === "Approved" ? "approve" : "decline";
    const group =
      attendeeType === "All"
        ? "all pending users"
        : attendeeType === "Student"
          ? "all pending students"
          : "all pending professionals";

    return `Are you sure you want to ${action} ${group}? This action cannot be undone.`;
  };

  return (
    <div className="flex items-center gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 hover:text-emerald-700"
            disabled={isUpdating}
          >
            {isUpdating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Users className="mr-2 h-4 w-4" />
            )}
            Bulk Actions
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end">
          <DropdownMenuLabel className="font-normal text-muted-foreground text-xs py-2">
            Pending: {pendingCount} users (on this page)
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-emerald-600 py-1">
              Approve Users
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => handleBulkActionClick("Approved", "All")}
              className="cursor-pointer"
            >
              <Check className="mr-2 h-4 w-4 text-emerald-600" />
              <span>All Pending Users</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleBulkActionClick("Approved", "Professional")}
              className="cursor-pointer"
            >
              <Briefcase className="mr-2 h-4 w-4 text-emerald-600" />
              <span>Professionals Only</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleBulkActionClick("Approved", "Student")}
              className="cursor-pointer"
            >
              <GraduationCap className="mr-2 h-4 w-4 text-emerald-600" />
              <span>Students Only</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-red-500 py-1">
              Decline Users
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => handleBulkActionClick("Declined", "All")}
              className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
            >
              <X className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>All Pending Users</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleBulkActionClick("Declined", "Professional")}
              className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
            >
              <Briefcase className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>Professionals Only</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleBulkActionClick("Declined", "Student")}
              className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
            >
              <GraduationCap className="mr-2 h-4 w-4 text-muted-foreground" />
              <span>Students Only</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={confirmDialog.isOpen}
        onOpenChange={(isOpen) => setConfirmDialog((prev) => ({ ...prev, isOpen }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Bulk Action</AlertDialogTitle>
            <AlertDialogDescription>
              {getConfirmationMessage()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirmDialog.status === "Declined"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white"
              }
              onClick={executeBulkUpdate}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
