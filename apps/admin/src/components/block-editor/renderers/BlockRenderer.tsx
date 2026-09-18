import { CardBlock } from "./CardBlock";
import { HeaderBlock } from "./HeaderBlock";
import { LayoutBlock } from "./LayoutBlock";
import { ParagraphBlock } from "./ParagraphBlock";
import { ImageBlock } from "./ImageBlock";
import { TableBlock } from "./TableBlock";
import { VideoBlock } from "./VideoBlock";
import { YoutubeBlock } from "./YoutubeBlock";
import { CodeBlock } from "./CodeBlock";

export function BlockRenderer({ block, actions }: any) {
    if (block.type === "layout")
        return <LayoutBlock block={block} actions={actions} />;

    if (block.type === "header")
        return <HeaderBlock block={block} actions={actions} />;

    if (block.type === "card")
        return <CardBlock block={block} actions={actions} />;

    if (block.type === "paragraph")
        return <ParagraphBlock block={block} actions={actions} />;

    if (block.type === "image")
        return <ImageBlock block={block} actions={actions} />;

    if (block.type === "table")
        return <TableBlock block={block} actions={actions} />;

    if (block.type === "video")
        return <VideoBlock block={block} actions={actions} />;

    if (block.type === "youtube")
        return <YoutubeBlock block={block} actions={actions} />;

    if (block.type === "code")
        return <CodeBlock block={block} actions={actions} />;

    return null;
}
