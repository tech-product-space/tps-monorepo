import { IBlockBase } from "../types/block.types";
import { resolveStorageUrl } from "@/lib/stoage";

export function ImagePreview({ block }: { block: IBlockBase }) {
  const { key, alt, caption, width = "100", alignment = "center" } = block.data;

  if (!key) return null;

  const imageUrl = resolveStorageUrl(key);

  const imageStyle: React.CSSProperties = {
    width: `${width}%`,
    height: "auto",
    borderRadius: "8px",
    display: "block",
  };

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: alignment === "center" ? "center" : alignment === "right" ? "flex-end" : "flex-start",
    width: "100%",
  };

  return (
    <figure className="block-image my-6" style={containerStyle}>
      <img
        src={imageUrl}
        alt={alt || ""}
        style={imageStyle}
      />
      {caption && (
        <figcaption className="text-center text-sm text-muted-foreground italic">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
