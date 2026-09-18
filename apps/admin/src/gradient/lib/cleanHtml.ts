export const cleanHtml = (html: string) => {
  return html
    .replace(/\n/g, "<br />")
    .replace(/white-space:\s*pre-wrap;?/g, "")
    .replace(/white-space:\s*pre;?/g, "")
    .replace(/<p\b[^>]*>/gi, "<div>")
    .replace(/<\/p>/gi, "</div>")
    .replace(
      /font-family:[^;"']+;?/gi,
      "font-family: Arial, Helvetica, sans-serif;",
    );
};
