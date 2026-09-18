"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Mail, Clock, GitBranch, Plus } from "lucide-react";
import type { NodeType } from "@/types/workflow";

type Props = {
  onInsert: (type: NodeType) => void;
  disabled?: boolean;
  /**
   * If true, render with a connector line above and below the button so the
   * button sits on the vertical thread between two node cards. Use `false`
   * for the top-of-flow add button.
   */
  withConnector?: boolean;
};

export default function InsertNodeMenu({
  onInsert,
  disabled,
  withConnector = true,
}: Props) {
  return (
    <div className="relative flex justify-center items-center py-2">
      {withConnector && (
        <div
          className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-px bg-zinc-200"
          aria-hidden
        />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="rounded-full bg-white shadow-sm relative z-10 h-8 px-3"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add step
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuItem onClick={() => onInsert("action.send_email")}>
            <Mail className="h-4 w-4 mr-2" />
            Send email
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsert("control.delay")}>
            <Clock className="h-4 w-4 mr-2" />
            Wait
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onInsert("control.condition")}>
            <GitBranch className="h-4 w-4 mr-2" />
            If / then
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
