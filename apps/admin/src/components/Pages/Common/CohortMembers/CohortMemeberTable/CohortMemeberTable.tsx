"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Edit, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CohortMember } from "@/services/cohort-members/cohort-members";


interface Props {
  members: CohortMember[];
  onEdit: (member: CohortMember) => void;
  onDelete: (member: CohortMember) => void;
}

export const CohortMembersTable = ({
  members,
  onEdit,
  onDelete,
}: Props) => {
  const [deleteTarget, setDeleteTarget] = useState<CohortMember | null>(null);

  return (
    <>
      <div className="rounded-md bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Cohort</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-8 text-muted-foreground"
                >
                  No cohort members found
                </TableCell>
              </TableRow>
            ) : (
              members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.user?.name || "—"}
                  </TableCell>
                  <TableCell>{member.user?.email || "—"}</TableCell>
                  <TableCell>{member.user?.phone || "—"}</TableCell>
                  <TableCell>{member.course}</TableCell>
                  <TableCell>{member.cohort}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{member.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <IconButton label="Edit" onClick={() => onEdit(member)}>
                        <Edit className="h-4 w-4" />
                      </IconButton>

                      <IconButton
                        label="Delete"
                        danger
                        onClick={() => setDeleteTarget(member)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* DELETE CONFIRMATION */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete cohort member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium">{deleteTarget?.user?.name}</span>.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteTarget) {
                  onDelete(deleteTarget);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const IconButton = ({
  children,
  onClick,
  label,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) => (
  <Button
    variant="ghost"
    size="icon"
    onClick={onClick}
    title={label}
    className={
      danger
        ? "text-red-500 hover:bg-red-50 hover:text-red-600"
        : "text-neutral-600 hover:bg-neutral-100"
    }
  >
    {children}
  </Button>
);
