"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { ILead } from "../../types/leads";

type Props = {
  lead: ILead | null;
  open: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
};

const LeadDeleteDialog = ({ lead, open, onClose, onDelete }: Props) => {
  if (!lead) return null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Lead</AlertDialogTitle>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            onClick={() => onDelete(lead.id.toString())}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default LeadDeleteDialog;
