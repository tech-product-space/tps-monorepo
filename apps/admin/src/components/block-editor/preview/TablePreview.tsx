export function TablePreview({ block }: any) {
  return (
    <div
      className="block-table"
      dangerouslySetInnerHTML={{ __html: block.data.html || "" }}
    />
  );
}
