"use client";

import { Mail, Clock, GitBranch, Plus, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NodeType } from "@/types/workflow";

type Props = {
  onPick: (type: NodeType) => void;
  /** Optional label override — used by trigger when there's nothing yet. */
  label?: string;
  size?: "sm" | "md";
  /** Hide certain types — used to keep the if/then's Yes/No menus simple. */
  exclude?: NodeType[];
};

const ITEMS: Array<{ type: NodeType; label: string; Icon: React.ComponentType<any>; tint: string }> = [
  { type: "action.send_email", label: "Send email", Icon: Mail, tint: "text-sky-600" },
  { type: "control.delay", label: "Wait", Icon: Clock, tint: "text-amber-600" },
  { type: "control.condition", label: "If / then", Icon: GitBranch, tint: "text-violet-600" },
  { type: "control.goal", label: "Exit", Icon: LogOut, tint: "text-emerald-600" },
];

export default function AddStepMenu({ onPick, label, size = "sm", exclude }: Props) {
  const items = ITEMS.filter((i) => !exclude?.includes(i.type));
  const buttonClasses =
    size === "md"
      ? "h-7 px-2.5 text-xs"
      : "h-6 px-2 text-[11px]";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={`nodrag inline-flex items-center gap-1 rounded-full bg-white border-2 border-dashed border-zinc-300 hover:border-primary hover:text-primary text-zinc-600 font-medium shadow-sm transition ${buttonClasses}`}
          type="button"
        >
          <Plus className="h-3 w-3" />
          {label || "Add step"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        side="bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((i) => (
          <DropdownMenuItem
            key={i.type}
            onClick={(e) => {
              e.stopPropagation();
              onPick(i.type);
            }}
          >
            <i.Icon className={`h-4 w-4 mr-2 ${i.tint}`} />
            {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
