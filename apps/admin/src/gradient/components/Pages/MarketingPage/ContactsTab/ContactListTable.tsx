"use client";

import { Pencil, Trash2, Upload } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
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

import type { ContactList } from "@/gradient/types/contact";

interface Props {
  lists: ContactList[];
  onOpen: (list: ContactList) => void;
  onUpload: (list: ContactList) => void;
  onEdit: (list: ContactList) => void;
  onDelete: (list: ContactList) => void;
}

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

export default function ContactListTable({
  lists,
  onOpen,
  onUpload,
  onEdit,
  onDelete,
}: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Contacts</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Created by</TableHead>
          <TableHead className="w-[150px]">Actions</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {lists.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-muted-foreground py-12 text-center">
              No contact lists yet. Create one and upload a CSV.
            </TableCell>
          </TableRow>
        )}

        {lists.map((list) => (
          <TableRow
            key={list.id}
            className="hover:bg-muted/40 cursor-pointer"
            onClick={() => onOpen(list)}
          >
            <TableCell className="font-medium">
              {list.name}
              {list.description && (
                <span className="text-muted-foreground block max-w-[360px] truncate text-xs">
                  {list.description}
                </span>
              )}
            </TableCell>

            <TableCell>
              {/* An empty list is a common half-finished state — a list gets
                  created and the upload fails or never happens — and it is
                  worth naming rather than showing as a bare 0. */}
              {list.contactCount ? (
                list.contactCount.toLocaleString()
              ) : (
                <span className="text-muted-foreground">empty</span>
              )}
            </TableCell>

            <TableCell className="text-muted-foreground text-sm">
              {formatDate(list.createdAt)}
            </TableCell>

            <TableCell className="text-muted-foreground text-sm">
              {list.createdAdmin?.name || "—"}
            </TableCell>

            {/* Row click opens the list, so the buttons must not also fire it. */}
            <TableCell onClick={(e) => e.stopPropagation()}>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  title="Upload a CSV"
                  onClick={() => onUpload(list)}
                >
                  <Upload className="h-4 w-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  title="Rename"
                  onClick={() => onEdit(list)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" title="Delete">
                      <Trash2 className="text-destructive h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>

                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete contact list</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes <b>{list.name}</b> and its{" "}
                        {(list.contactCount || 0).toLocaleString()} contacts.
                        Campaigns already sent to it keep their record of who
                        received them; a draft or scheduled campaign still using
                        it will refuse the delete.
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onDelete(list)}
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
