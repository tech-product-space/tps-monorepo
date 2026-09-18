// utils/cleanJobHtml.ts

export function cleanJobHtml(html: string | null | undefined): string {
  if (!html) return "";

  return (
    html
      // 0. Normalize non-breaking spaces (both HTML entity and unicode)
      .replace(/&nbsp;/g, " ")
      .replace(/\u00A0/g, " ")

      // 1. Collapse all <br> variants
      .replace(/<br\s*\/?>/gi, " ")

      // 2. Merge consecutive <em>...</em> blocks separated by whitespace
      .replace(/<\/em>\s*<em>/gi, " ")

      // 3. Merge consecutive <span>...</span> from same color (common in scraped HTML)
      .replace(/<\/span>\s*<span[^>]*>/gi, " ")

      // 4. Remove empty tags — <li></li>, <p></p>, <em></em>, <span></span>
      .replace(/<(li|p|em|span|strong)[^>]*>\s*<\/\1>/gi, "")

      // 5. Remove <li> items that only contain whitespace or &nbsp;
      .replace(/<li[^>]*>(\s|&nbsp;)*<\/li>/gi, "")

      // 6. Collapse multiple spaces
      .replace(/ {2,}/g, " ")

      // 7. Remove empty <ul> or <ol> blocks left after cleanup
      .replace(/<(ul|ol)[^>]*>\s*<\/(ul|ol)>/gi, "")

      // 8. Merge consecutive <em> blocks (broken across <br> or whitespace)
      .replace(/<\/em>\s*(<br\s*\/?>)?\s*<em>/gi, " ")

      // 9. Unwrap <em> that only contains a <strong> — treat as heading not callout
      .replace(
        /<em>\s*<strong>(.*?)<\/strong>\s*<\/em>/gi,
        "<strong>$1</strong>",
      )
  );
}
