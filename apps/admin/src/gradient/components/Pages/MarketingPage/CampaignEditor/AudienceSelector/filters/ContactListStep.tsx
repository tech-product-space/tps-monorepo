"use client";

import { Users } from "lucide-react";

import { Checkbox } from "@/gradient/components/ui/checkbox";

import type { AudienceSources } from "@/gradient/types/campaign";
import StepShell from "./StepShell";

interface Props {
  sources: AudienceSources;
  selectedIds: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}

/**
 * The CSV lists uploaded under Marketing → Contacts.
 *
 * Sizes are shown because a list's name says nothing about whether it holds
 * thirty people or thirty thousand, and that is the whole decision here.
 */
export default function ContactListStep({
  sources,
  selectedIds,
  disabled,
  onChange,
}: Props) {
  const toggle = (id: string) =>
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((v) => v !== id)
        : [...selectedIds, id],
    );

  if (!sources.contactLists.items.length) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center">
        <Users className="h-7 w-7 opacity-30" />
        <p className="text-sm">No contact lists yet.</p>
        <p className="text-xs">
          Upload one under Marketing → Contacts, then come back.
        </p>
      </div>
    );
  }

  return (
    <StepShell
      items={sources.contactLists.items}
      selectedCount={selectedIds.length}
      keyOf={(l) => l.id}
      isSelected={(l) => selectedIds.includes(l.id)}
      searchText={(l) => l.name}
      placeholder="Search contact lists…"
      emptyLabel="No lists found"
      noun="list"
      render={(list, selected) => (
        <label
          className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-white px-4 py-3 transition ${
            selected ? "border-primary/50" : "hover:border-muted-foreground/30"
          }`}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => toggle(list.id)}
            disabled={disabled}
          />

          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {list.name}
          </span>

          <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-[11px]">
            <Users className="h-3 w-3" />
            {list.contactCount.toLocaleString()}
          </span>
        </label>
      )}
    />
  );
}
