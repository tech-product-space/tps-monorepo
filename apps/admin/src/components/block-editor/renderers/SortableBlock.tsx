"use client";

import React, { createContext, useContext } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BlockType } from "../types/block.types";

type DragHandleContextType = {
    setActivatorNodeRef: (node: HTMLElement | null) => void;
    listeners: any;
    attributes: any;
};

const DragHandleContext = createContext<DragHandleContextType | null>(null);

export function useDragHandle() {
    const ctx = useContext(DragHandleContext);
    if (!ctx) throw new Error("useDragHandle must be used inside SortableBlock");
    return ctx;
}

interface Props {
    id: string;
    type: string;
    activeType: BlockType | null;
    children: React.ReactNode;
}

export function SortableBlock({ id, type, activeType, children }: Props) {
    const {
        setNodeRef,
        setActivatorNodeRef,
        listeners,
        attributes,
        transform,
        transition,
        isOver,
        isDragging,
    } = useSortable({ id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        width: "100%",
        maxHeight: isDragging ? 200 : undefined,
        overflow: isDragging ? "hidden" : undefined,
    };

    const showIndicator =
        isOver && (activeType !== "layout" || type === "layout");


    return (
        <DragHandleContext.Provider
            value={{ setActivatorNodeRef, listeners, attributes }}
        >
            <div ref={setNodeRef} style={style} className="relative">

                {/* Drop indicator */}
                {showIndicator && (
                    <div className="absolute inset-x-0 -top-1 h-1 bg-primary rounded-full z-50" />
                )}

                {/* Hide original while dragging */}
                <div
                    className="w-full min-w-0"
                    style={{
                        opacity: isDragging ? 0 : 1,
                        pointerEvents: isDragging ? "none" : "auto",
                    }}
                >
                    {children}
                </div>

            </div>
        </DragHandleContext.Provider>
    );
}
