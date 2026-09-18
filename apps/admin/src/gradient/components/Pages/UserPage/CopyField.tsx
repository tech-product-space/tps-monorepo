"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";

/**
 * A read-only value with a copy button — invite links, reset links, temporary
 * passwords. Every one of these is emailed to the admin as well; this is the
 * fallback for when mail is slow, blocked, or the Super Admin would rather hand
 * it over directly.
 */
export default function CopyField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>

      <div className="flex gap-2">
        <Input
          value={value}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          className={mono ? "font-mono tracking-wide" : undefined}
        />

        <Button type="button" variant="outline" onClick={copy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </Button>
      </div>
    </div>
  );
}
