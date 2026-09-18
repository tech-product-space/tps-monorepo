import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContactList } from "@/services/contact/contactService";

interface ContactListTableProps {
  contactLists: ContactList[];
  onSelectList: (list: ContactList) => void;
}

export default function ContactListTable({
  contactLists,
  onSelectList,
}: ContactListTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>List Name</TableHead>
          <TableHead>Contacts</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created At</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contactLists.map((list) => (
          <TableRow
            key={list.id}
            className="cursor-pointer hover:bg-gray-50"
            onClick={() => onSelectList(list)}
          >
            <TableCell className="font-medium">{list.name}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1 text-gray-600">
                <Users className="w-3.5 h-3.5" />
                {list.contactCount ?? 0}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={list.isActive ? "default" : "secondary"}>
                {list.isActive ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell className="text-gray-500 text-sm">
              {new Date(list.createdAt).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </TableCell>
            <TableCell className="text-right">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectList(list);
                }}
              >
                View
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

