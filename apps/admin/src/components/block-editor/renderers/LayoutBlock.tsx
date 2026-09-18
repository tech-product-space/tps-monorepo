import { CSSProperties } from "react";
import { Plus, Trash2, LayoutGrid, Columns, Rows3, GripVertical, Image as ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { IBlockBase } from "../types/block.types";
import { createHeader, createCard, createLayout, createParagraph, createImage, createTable, createVideo, createYoutube, createCode } from "../utils/blockFactory";
import { BlockRenderer } from "./BlockRenderer";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableBlock, useDragHandle } from "./SortableBlock";

export function LayoutBlock({ block, actions }: any) {
    const { setActivatorNodeRef, listeners, attributes } = useDragHandle();

    const { layoutType, columns, gap = 8 } = block.data;

    const style: CSSProperties =
        layoutType === "grid"
            ? {
                display: "grid",
                gridTemplateColumns: `repeat(${columns || 2}, 1fr)`,
                gap: `${gap}px`,
                minWidth: 0,
            }
            : layoutType === "row"
                ? {
                    display: "flex",
                    flexDirection: "row",
                    gap: `${gap}px`,
                    minWidth: 0,
                }
                : {
                    display: "flex",
                    flexDirection: "column",
                    gap: `${gap}px`,
                    minWidth: 0,
                };

    const changeLayoutType = (value: string) => {
        actions.update(block.id, {
            layoutType: value,
            columns: value === "grid" ? columns || 2 : undefined,
        });
    };

    const changeColumns = (value: string) => {
        actions.update(block.id, { columns: Number(value) });
    };

    const changeGap = (value: number) => {
        actions.update(block.id, { gap: value });
    };

    return (
        <div className="group rounded-xl border-2 border-border/70 bg-muted/20 shadow-sm hover:border-border transition-colors">

            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <span
                        ref={setActivatorNodeRef}
                        {...listeners}
                        {...attributes}
                        className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted"
                    >
                        <GripVertical className="h-4 w-4" />
                    </span>

                    <LayoutGrid className="h-4 w-4" />
                    Layout
                </div>

                <div className="flex items-center gap-1">

                    {/* Layout type selector */}
                    <Select value={layoutType} onValueChange={changeLayoutType}>
                        <SelectTrigger className="h-7 w-[115px] text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="grid">
                                <div className="flex items-center gap-2">
                                    <LayoutGrid className="h-3 w-3" /> Grid
                                </div>
                            </SelectItem>
                            <SelectItem value="row">
                                <div className="flex items-center gap-2">
                                    <Rows3 className="h-3 w-3" /> Row
                                </div>
                            </SelectItem>
                            <SelectItem value="column">
                                <div className="flex items-center gap-2">
                                    <Columns className="h-3 w-3" /> Column
                                </div>
                            </SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Grid columns */}
                    {layoutType === "grid" && (
                        <Select value={String(columns || 2)} onValueChange={changeColumns}>
                            <SelectTrigger className="h-7 w-20 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {[1, 2, 3, 4].map((c) => (
                                    <SelectItem key={c} value={String(c)}>
                                        {c} col
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    {/* Gap control */}
                    <div className="flex items-center gap-1 ml-2">
                        <span className="text-[10px] text-muted-foreground">Gap</span>

                        <button
                            onClick={() => changeGap(Math.max(0, gap - 4))}
                            className="h-7 w-7 border rounded text-xs hover:bg-muted"
                        >
                            −
                        </button>

                        <div className="w-12 text-center text-xs border rounded py-1">
                            {gap}px
                        </div>

                        <button
                            onClick={() => changeGap(Math.min(64, gap + 4))}
                            className="h-7 w-7 border rounded text-xs hover:bg-muted"
                        >
                            +
                        </button>
                    </div>

                    {/* Delete */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => actions.remove(block.id)}
                        className="h-7 w-7"
                    >
                        <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                </div>
            </div>

            {/* Add buttons */}
            <div className="flex gap-1 px-3 py-2 border-b bg-muted/20">
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => actions.addChild(block.id, createHeader())}
                >
                    <Plus className="h-3 w-3 mr-1" /> Header
                </Button>

                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => actions.addChild(block.id, createParagraph())}
                >
                    <Plus className="h-3 w-3 mr-1" /> Paragraph
                </Button>

                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => actions.addChild(block.id, createImage())}
                >
                    <Plus className="h-3 w-3 mr-1" /> Image
                </Button>

                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => actions.addChild(block.id, createCard())}
                >
                    <Plus className="h-3 w-3 mr-1" /> Card
                </Button>

                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => actions.addChild(block.id, createTable())}
                >
                    <Plus className="h-3 w-3 mr-1" /> Table
                </Button>

                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => actions.addChild(block.id, createVideo())}
                >
                    <Plus className="h-3 w-3 mr-1" /> Video
                </Button>

                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => actions.addChild(block.id, createYoutube())}
                >
                    <Plus className="h-3 w-3 mr-1" /> YouTube
                </Button>

                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => actions.addChild(block.id, createCode())}
                >
                    <Plus className="h-3 w-3 mr-1" /> Code
                </Button>

                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => actions.addChild(block.id, createLayout("column"))}
                >
                    <Plus className="h-3 w-3 mr-1" /> Layout
                </Button>
            </div>

            {/* Content */}
            <div className="p-3 overflow-x-auto" style={style}>
                {block.children?.length ? (
                    <SortableContext
                        items={block.children.map((c: IBlockBase) => c.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {block.children.map((child: IBlockBase) => (
                            <SortableBlock
                                key={child.id}
                                id={child.id}
                                type={child.type}
                                activeType={actions.activeType}
                            >
                                <BlockRenderer block={child} actions={actions} />
                            </SortableBlock>
                        ))}
                    </SortableContext>
                ) : (
                    <div className="text-xs text-muted-foreground italic border border-dashed rounded p-3 text-center">
                        Empty layout – add blocks
                    </div>
                )}
            </div>
        </div>
    );
}
