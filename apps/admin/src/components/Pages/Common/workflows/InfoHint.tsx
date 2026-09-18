"use client";

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Props = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Small `i` icon that reveals a tooltip on hover/focus. Used inline next to
 * labels in trigger/settings forms to explain non-obvious fields without
 * cluttering the form with help text.
 */
export default function InfoHint({ children, className = "" }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="More info"
          onClick={(e) => e.preventDefault()}
          className={`inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground align-middle ${className}`}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-left leading-snug">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
