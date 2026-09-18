export function HeaderPreview({ block }: any) {
  return (
    <div
      className="block-header"
      dangerouslySetInnerHTML={{ __html: block.data.html || "" }}
    />
  );
}
