import { IBlockBase } from "../types/block.types";
import { resolveStorageUrl } from "@/lib/stoage";

export function VideoPreview({ block }: { block: IBlockBase }) {
  const {
    sourceMode = "upload",
    key,
    src,
    thumbnailMode = "upload",
    thumbnailKey,
    thumbnail,
    alt,
    caption,
    credit,
    loop = false,
    autoplay = false,
    width = "100",
    alignment = "center",
    aspectRatio,
    maxHeight = 600,
  } = block.data;

  const videoUrl = sourceMode === "upload" ? resolveStorageUrl(key) : src;
  const thumbnailUrl =
    thumbnailMode === "upload"
      ? thumbnailKey
        ? resolveStorageUrl(thumbnailKey)
        : ""
      : thumbnail || "";

  if (!videoUrl) return null;

  const outerStyle: React.CSSProperties = {
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

  const containerStyle: React.CSSProperties = {
    width: `${width}%`,
    maxWidth: aspectRatio ? `${maxHeight * aspectRatio}px` : undefined,
  };

  const frameStyle: React.CSSProperties = {
    width: "100%",
    aspectRatio: aspectRatio ? String(aspectRatio) : undefined,
    background: "#000",
    borderRadius: "8px",
    overflow: "hidden",
  };

  const videoFillStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  };

  return (
    <figure className="block-video my-6" style={outerStyle}>
      <div style={containerStyle}>
        <div style={frameStyle}>
          <video
            key={`${videoUrl}-${autoplay}-${loop}`}
            src={videoUrl}
            controls
            loop={loop}
            autoPlay={autoplay}
            playsInline
            poster={thumbnailUrl || undefined}
            aria-label={alt || undefined}
            style={videoFillStyle}
          />
        </div>
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
