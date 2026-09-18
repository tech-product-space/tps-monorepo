"use client";
import * as SelectPrimitive from "@radix-ui/react-select";
import { CheckIcon } from "lucide-react";
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SUPPORTED_CURRENCIES } from "./expenseUtils";

// A currency picker shared by every expense form. The dropdown shows the code
// AND the symbol, but the trigger shows only the code: the symbol is rendered
// OUTSIDE <ItemText>, and Radix's <SelectValue> only mirrors the ItemText of the
// selected item. The trigger is w-fit by default so there's no trailing gap
// between the short code and the chevron.
export function CurrencySelect({
  value,
  onValueChange,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="min-w-[7rem]">
        {SUPPORTED_CURRENCIES.map((c) => (
          <SelectPrimitive.Item
            key={c.code}
            value={c.code}
            className={cn(
              "focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center gap-3",
              "rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none",
              "data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            )}
          >
            <SelectPrimitive.ItemText>{c.code}</SelectPrimitive.ItemText>
            <span className="text-muted-foreground ml-auto">{c.symbol}</span>
            <span className="absolute right-2 flex size-3.5 items-center justify-center">
              <SelectPrimitive.ItemIndicator>
                <CheckIcon className="size-4" />
              </SelectPrimitive.ItemIndicator>
            </span>
          </SelectPrimitive.Item>
        ))}
      </SelectContent>
    </Select>
  );
}
