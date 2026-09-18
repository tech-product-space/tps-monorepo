export function CardPreview({ block }: any) {
  const variant = block.data.variant || "default";

  return (
    <div className={`block-card block-card-${variant}`}>
      <div
        dangerouslySetInnerHTML={{ __html: block.data.html || "" }}
      />
    </div>
  );
}
