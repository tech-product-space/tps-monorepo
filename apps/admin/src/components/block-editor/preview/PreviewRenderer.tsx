import { IBlockBase } from "../types/block.types";
import { LayoutPreview } from "./LayoutPreview";
import { HeaderPreview } from "./HeaderPreview";
import { ParagraphPreview } from "./ParagraphPreview";
import { CardPreview } from "./CardPreview";
import { ImagePreview } from "./ImagePreview";
import { TablePreview } from "./TablePreview";
import { VideoPreview } from "./VideoPreview";
import { YoutubePreview } from "./YoutubePreview";
import { CodePreview } from "./CodePreview";

export function PreviewRenderer({ block }: { block: IBlockBase }) {
  switch (block.type) {
    case "layout":
      return <LayoutPreview block={block} />;
    case "header":
      return <HeaderPreview block={block} />;
    case "paragraph":
      return <ParagraphPreview block={block} />;
    case "card":
      return <CardPreview block={block} />;
    case "image":
      return <ImagePreview block={block} />;
    case "table":
      return <TablePreview block={block} />;
    case "video":
      return <VideoPreview block={block} />;
    case "youtube":
      return <YoutubePreview block={block} />;
    case "code":
      return <CodePreview block={block} />;
    default:
      return null;
  }
}
