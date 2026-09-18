import { IBlockBase } from "../types/block.types";
import { buildYoutubeEmbedUrl } from "../renderers/YoutubeBlock";

export function YoutubePreview({ block }: { block: IBlockBase }) {
  const {
    src,
    alt,
    caption,
    credit,
    loop = false,
    autoplay = false,
    width = "100",
    alignment = "center",
  } = block.data;

  const embedUrl = buildYoutubeEmbedUrl(src, { loop, autoplay });
  if (!embedUrl) return null;

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems:
      alignment === "center"
        ? "center"
        : alignment === "right"
          ? "flex-end"
          : "flex-start",
    width: "100%",
  };

  const frameWrapperStyle: React.CSSProperties = {
    width: `${width}%`,
    position: "relative",
    paddingTop: "56.25%",
    borderRadius: "8px",
    overflow: "hidden",
  };

  return (
    <figure className="block-youtube my-6" style={containerStyle}>
      <div style={frameWrapperStyle}>
        <iframe
          src={embedUrl}
          title={alt || "YouTube video"}
          className="absolute inset-0 h-full w-full"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      {(caption || credit) && (
        <figcaption className="text-center text-sm text-muted-foreground italic mt-2">
          {caption}
          {caption && credit ? " — " : ""}
          {credit}
        </figcaption>
      )}
    </figure>
  );
}
