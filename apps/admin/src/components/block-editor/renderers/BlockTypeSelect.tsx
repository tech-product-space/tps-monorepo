"use client";

import { useState } from "react";
import { CreditCard, Heading2, Pilcrow } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { IBlockBase } from "../types/block.types";
import {
  BLOCK_TYPE_LABELS,
  CONVERTIBLE_TYPES,
  ConvertibleType,
  convertBlock,
} from "../utils/blockConvert";

const ICONS: Record<ConvertibleType, typeof Heading2> = {
  header: Heading2,
  paragraph: Pilcrow,
  card: CreditCard,
};

const preview = (text: string) =>
  text.length > 60 ? `${text.slice(0, 60).trimEnd()}…` : text;

interface Props {
  block: IBlockBase;
  actions: any;
}

/**
 * Replaces the static type label in each text block's toolbar. Conversions that
 * would delete visible text ask first — there's no undo in this editor.
 */
export function BlockTypeSelect({ block, actions }: Props) {
  const [pending, setPending] = useState<{
    target: ConvertibleType;
    kept: string;
  } | null>(null);

  const handleSelect = (value: string) => {
    const target = value as ConvertibleType;
    if (target === block.type) return;

    const { textLoss } = convertBlock(block, target);
    if (textLoss) {
      setPending({ target, kept: textLoss.kept });
      return;
    }

    actions.changeType(block.id, target);
  };

  const confirm = () => {
    if (pending) actions.changeType(block.id, pending.target);
    setPending(null);
  };

  const label = pending ? BLOCK_TYPE_LABELS[pending.target] : "";

  return (
    <>
      <Select value={block.type} onValueChange={handleSelect}>
        <SelectTrigger
          className="h-7 w-[130px] text-xs"
          aria-label="Block type"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CONVERTIBLE_TYPES.map((type) => {
            const Icon = ICONS[type];
            return (
              <SelectItem key={type} value={type}>
                <div className="flex items-center gap-2">
                  <Icon className="h-3 w-3" /> {BLOCK_TYPE_LABELS[type]}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kept ? (
                <>
                  A {label} holds a single line, so only{" "}
                  <span className="font-medium text-foreground">
                    “{preview(pending.kept)}”
                  </span>{" "}
                  will be kept. The rest of this block will be deleted, and this
                  can&apos;t be undone.
                </>
              ) : (
                <>
                  None of this block&apos;s content can become a {label}, so
                  converting will leave it empty. This can&apos;t be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>
              Convert and delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
