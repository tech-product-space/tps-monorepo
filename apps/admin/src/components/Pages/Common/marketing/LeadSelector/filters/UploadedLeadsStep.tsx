import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ContactList } from "@/services/contact/contactService";
import { Users, FileText } from "lucide-react";

interface ContactListStepProps {
  contactLists: ContactList[];
  loading: boolean;
  selectedListIds: string[];
  onToggleList: (id: string) => void;
}

export default function ContactListStep({
  contactLists,
  loading,
  selectedListIds,
  onToggleList,
}: ContactListStepProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p>Loading contact lists...</p>
      </div>
    );
  }

  if (contactLists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <Users className="w-12 h-12 opacity-20" />
        <p>No contact lists found.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-1">
      {contactLists.map((list) => {
        const isSelected = selectedListIds.includes(list.id);
        return (
          <div
            key={list.id}
            onClick={() => onToggleList(list.id)}
            className={`flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer group ${
              isSelected
                ? "bg-primary/5 border-primary ring-1 ring-primary/20"
                : "bg-white border-border hover:border-muted-foreground/30 hover:bg-muted/30"
            }`}
          >
            <div className="mt-1">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleList(list.id)}
                className="pointer-events-none"
              />
            </div>

            <div className="flex-1 space-y-1">
              <div className="flex items-start justify-between">
                <Label className="font-semibold text-base leading-none cursor-pointer">
                  {list.name}
                </Label>
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>{list.contactCount ?? 0} contacts</span>
                </div>
                <div className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  <span>{new Date(list.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
