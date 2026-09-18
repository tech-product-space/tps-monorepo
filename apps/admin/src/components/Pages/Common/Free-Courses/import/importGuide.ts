// A self-contained authoring guide the admin can download from the import
// dialog. Kept as Markdown so it opens as readable plain text anywhere and shows
// the code-fence convention literally.

export const IMPORT_GUIDE_FILENAME = "Lesson-Import-Guide.md";

export const IMPORT_GUIDE_MARKDOWN = `# Formatting a Google Doc for lesson import

This guide explains how to write a Google Doc so it imports cleanly into a
course module. When you're done, export with **File → Download → Microsoft Word
(.docx)** and drop the file into the "Import Lessons → Google Doc" dialog.
Imported lessons are always added as **drafts**, and you get a preview before
anything is saved.

## 1. Splitting the document into lessons

Each **Heading 1** starts a new lesson (you can switch this to Heading 2 in the
dialog). The heading text becomes the lesson title. Everything under a heading,
until the next one, becomes that lesson's content.

- Use the real heading styles (Format → Paragraph styles → Heading 1/2), not
  just bold big text.
- Anything before the first heading becomes a lesson named after the file —
  rename or remove it in the preview.

## 2. What comes across

| In your doc            | Becomes in the lesson         |
|------------------------|-------------------------------|
| Heading 1 / 2          | Lesson title (split point)    |
| Heading 3              | Section heading               |
| Heading 4–6            | Plain paragraph               |
| Normal paragraph       | Paragraph                     |
| Bold / italic / links  | Kept                          |
| Bullet / numbered list | List                          |
| Table                  | Table                         |
| Image                  | Image (uploaded for you)      |
| Quote block            | Quote                         |
| Code (see below)       | Code block                    |

The lesson editor has three heading levels. Anything deeper than Heading 3
arrives as an ordinary paragraph — use bold text if you need a smaller label.

Colours, fonts, and spacing are not carried over — the lesson uses the course's
own styling.

## 3. Code blocks (important)

Wrap code in **triple backticks**, with the language on the opening line:

\`\`\`python
def greet(name):
    print(f"Hello, {name}")
\`\`\`

Rules for reliable code import:

1. **Use triple backticks** around every code snippet. The opening line can name
   the language (\`\`\`python, \`\`\`sql, \`\`\`javascript, …); leave it blank for plain text.
2. **Indent with spaces, not Tab.** Google Docs can store a Tab as paragraph
   indentation, which can't be recovered.
3. **Turn off Markdown auto-formatting** so the backticks stay as text:
   **Tools → Preferences → uncheck "Automatically detect Markdown"**. Do this
   before you type the fences.
4. Don't forget the **closing** \`\`\`. If a fence is left open, the importer still
   brings it in but flags a warning in the preview.

Curly "smart quotes" and non-breaking spaces inside a code block are cleaned up
automatically, so your code stays copy-paste safe.

## 4. Images

Images are uploaded for you during import (a copied-markdown version can't carry
image data, which is why we use .docx). Very large images (over 10 MB) are
skipped with a note — add those directly in the editor.

## 5. After importing

- Review each lesson in the preview; remove any you don't want.
- Read the notes/warnings panel — it lists anything that couldn't be imported.
- Click Import. Lessons land as drafts at the end of the module; publish them
  when you're ready.
`;

/** Triggers a client-side download of the import guide as a Markdown file. */
export function downloadImportGuide(): void {
  const blob = new Blob([IMPORT_GUIDE_MARKDOWN], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = IMPORT_GUIDE_FILENAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
