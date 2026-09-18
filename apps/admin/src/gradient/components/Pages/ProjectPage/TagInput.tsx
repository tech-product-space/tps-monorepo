"use client";

import { KeyboardEvent, useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/gradient/components/ui/badge";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";

interface Props {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  hint?: string;
}

/**
 * Prerequisites and skills.
 *
 * Stored as arrays rather than the comma-joined string the design renders,
 * because the UI does the joining and a filter over them later is then free.
 * Commas are still accepted as a separator on paste — an admin copying
 * "Python, HTML, CSS" out of a doc should not have to retype it three times.
 */
export default function TagInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: Props) {
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const parts = raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    if (!parts.length) return;

    // De-duplicated case-insensitively: "REST API" and "Rest API" are one chip,
    // not two. The first spelling wins, so the admin's casing survives.
    const seen = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value];

    for (const part of parts) {
      if (seen.has(part.toLowerCase())) continue;
      seen.add(part.toLowerCase());
      next.push(part);
    }

    onChange(next);
    setDraft("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
      return;
    }

    // Backspace on an empty box removes the last chip — the behaviour every
    // tag input has, and its absence is immediately annoying.
    if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="opacity-60 hover:opacity-100"
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        // Committed on blur too — a half-typed chip left in the box when the
        // admin clicks Save would otherwise be silently dropped.
        onBlur={() => commit(draft)}
        placeholder={placeholder}
      />

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
