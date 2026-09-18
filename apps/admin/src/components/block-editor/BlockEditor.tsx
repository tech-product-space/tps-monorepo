import { Plus, LayoutGrid, Code2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { IBlockBase } from "./types/block.types";
import { createLayout } from "./utils/blockFactory";
import { addChild, deleteBlock, updateBlock, moveBlock, replaceBlock } from "./utils/blockTree";
import { ConvertibleType, convertBlock, isConvertible } from "./utils/blockConvert";
import { BlockRenderer } from "./renderers/BlockRenderer";
import { SortableBlock } from "./renderers/SortableBlock";

import {
  DndContext,
  closestCenter,
  DragEndEvent,
  DragOverlay,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";

import { findBlockPosition } from "./helpers/findBlockPosition";
import { useCallback, useState } from "react";
import { findBlockById } from "./helpers/findBlockById";

interface BlockEditorProps {
  value: IBlockBase[];
  onChange: (blocks: IBlockBase[]) => void;
  output?: boolean;
  extraData?: Record<string, any>;
}

export function BlockEditor({ value, onChange, output = false, extraData }: BlockEditorProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const blocks = value;

  const setBlocks = useCallback(
    (updater: (prev: IBlockBase[]) => IBlockBase[]) => {
      const next = updater(value);
      onChange(next);
    },
    [value, onChange]  // only recreates when value or onChange actually changes
  );

  const activeBlock = activeId ? findBlockById(blocks, activeId) : null;

  const actions = {
    addRootLayout: () =>
      setBlocks((prev) => [...prev, createLayout("column")]),

    addChild: (parentId: string, block: IBlockBase) =>
      setBlocks((prev) => addChild(prev, parentId, block)),

    update: (id: string, data: Record<string, any>) =>
      setBlocks((prev) => updateBlock(prev, id, data)),

    changeType: (id: string, target: ConvertibleType) =>
      setBlocks((prev) => {
        const source = findBlockById(prev, id);
        if (!source || !isConvertible(source.type) || source.type === target) {
          return prev;
        }
        return replaceBlock(prev, id, convertBlock(source, target).block);
      }),

    // Whole-node swap that keeps the id (and therefore position). Used for
    // turning a fenced-code paste into a code block in place.
    replace: (id: string, block: IBlockBase) =>
      setBlocks((prev) => replaceBlock(prev, id, { ...block, id })),

    remove: (id: string) =>
      setBlocks((prev) => deleteBlock(prev, id)),

    move: (parentId: string | null, from: number, to: number) =>
      setBlocks((prev) => moveBlock(prev, parentId, from, to)),

    activeType: activeBlock?.type ?? null,
    extraData: extraData || {},
  };

  const handleDragStart = (event: any) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const from = findBlockPosition(blocks, String(active.id));
    const to = findBlockPosition(blocks, String(over.id));

    if (!from || !to) return;
    if (from.parentId !== to.parentId) return;

    const fromBlock = findBlockById(blocks, String(active.id));
    const toBlock = findBlockById(blocks, String(over.id));

    if (!fromBlock || !toBlock) return;

    if (fromBlock.type === "layout" && toBlock.type !== "layout") return;

    actions.move(from.parentId, from.index, to.index);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  return (
    <div className="border rounded-lg bg-background">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          Content Builder
        </div>

        <Button size="sm" onClick={actions.addRootLayout}>
          <Plus className="h-4 w-4 mr-1" />
          Add Layout
        </Button>
      </div>

      <Separator />

      {/* Editor Area */}
      <DndContext
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        autoScroll={{ threshold: { x: 0.1, y: 0.25 }, acceleration: 12 }}
      >
        <SortableContext
          items={blocks.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="p-4 space-y-3">

            {blocks.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-12 border border-dashed rounded-lg">
                No blocks yet. Click <strong>Add Layout</strong> to start building.
              </div>
            )}

            {blocks.map((block) => (
              <SortableBlock
                key={block.id}
                id={block.id}
                type={block.type}
                activeType={activeBlock?.type ?? null}
              >
                <BlockRenderer block={block} actions={actions} />
              </SortableBlock>
            ))}

          </div>
        </SortableContext>

        <DragOverlay>
          {activeBlock ? (
            <div className="w-[300px] bg-background border rounded-lg shadow-xl p-3 opacity-90">
              <div className="text-xs text-muted-foreground mb-1 capitalize">
                {activeBlock.type}
              </div>
              <div className="text-sm font-medium">Moving…</div>
            </div>
          ) : null}
        </DragOverlay>

      </DndContext>


      <Separator />

      {/* Debug JSON (optional) */}
      {output && (
        <div className="p-3 bg-muted/30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Code2 className="h-3 w-3" />
            Output JSON
          </div>

          <pre className="text-[11px] overflow-x-auto max-h-40">
            {JSON.stringify(blocks, null, 2)}
          </pre>
        </div>
      )}

    </div>
  );
}
