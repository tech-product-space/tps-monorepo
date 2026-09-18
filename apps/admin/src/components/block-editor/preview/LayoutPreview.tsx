import { CSSProperties } from "react";
import { IBlockBase } from "../types/block.types";
import { PreviewRenderer } from "./PreviewRenderer";

export function LayoutPreview({ block }: { block: IBlockBase }) {
  const { layoutType, columns, gap = 8 } = block.data;

  const style: CSSProperties =
    layoutType === "grid"
      ? { display: "grid", gridTemplateColumns: `repeat(${columns || 2}, 1fr)`, gap: `${gap}px` }
      : layoutType === "row"
      ? { display: "flex", gap: `${gap}px` }
      : { display: "flex", flexDirection: "column", gap: `${gap}px` };

  return (
    <div style={style} className="block-layout">
      {block.children?.map((child) => (
        <PreviewRenderer key={child.id} block={child} />
      ))}
    </div>
  );
}
