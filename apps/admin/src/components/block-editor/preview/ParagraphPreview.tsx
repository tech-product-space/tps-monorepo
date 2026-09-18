export function ParagraphPreview({ block }: any) {
  return (
    <div
      className="block-paragraph"
      dangerouslySetInnerHTML={{ __html: block.data.html || "" }}
    />
  );
}
