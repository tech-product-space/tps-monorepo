// A self-contained authoring guide the admin can download from the blog import
// dialog. Kept as Markdown so it opens as readable plain text anywhere.

export const BLOG_IMPORT_GUIDE_FILENAME = "Blog-Import-Guide.md";

export const BLOG_IMPORT_GUIDE_MARKDOWN = `# Formatting a Google Doc for blog import

This guide explains how to write a Google Doc so it imports cleanly into a blog
post. When you are done, export with **File > Download > Microsoft Word
(.docx)** and drop the file into the "Import from Doc" dialog on the Content
tab. You get a preview before anything is applied, and the import only reaches
the blog when you press **Save** — so nothing is live until you publish.

## 1. What gets imported

The **whole document** becomes the body of one blog post. Unlike a course
import, nothing is split: headings stay headings, they do not start new posts.

The blog's title, slug, cover image, SEO fields and reading time live on the
**Basic Details** tab and are not touched by the import.

If your doc starts with a Heading 1 carrying the article title, the dialog
offers to drop it — the title is already stored separately, so keeping it would
print it twice on the live page. The checkbox is on by default; untick it if
that heading is really part of the body.

## 2. What comes across

| In your doc            | Becomes in the post       |
|------------------------|---------------------------|
| Heading 1 / 2 / 3      | Heading 1 / 2 / 3         |
| Normal paragraph       | Paragraph                 |
| Bold / italic / links  | Kept                      |
| Bullet / numbered list | List                      |
| Table                  | Table                     |
| Image                  | Image (uploaded for you)  |
| Code between \`\`\` fences | Code block (see section 4) |

Colours, fonts, and spacing are not carried over — posts use the site's own
styling.

**Headings drive the table of contents.** The on-page contents sidebar is built
from Heading 2 and Heading 3 only, so structure the doc with those rather than
with bold text. Heading 4 and below import as text-level headings and do not
appear in the sidebar.

## 3. Images

Images are pulled out of the document and uploaded automatically, so you do not
need to host them anywhere first.

- Keep each image under **4 MB**. Anything larger is skipped, and the dialog
  tells you which one.
- PNG, JPG, GIF, WebP, BMP and TIFF are supported. Other formats are skipped.
- Paste images directly into the Doc rather than linking them.
- Widths are not carried over. Set a width by clicking the image in the editor
  after importing.

## 4. Code

Wrap code in fence lines. The opening fence names the language, the closing one
is bare, and both sit on their own line:

    \`\`\`python
    df = pd.read_csv("sales.csv")
    print(df.head())
    \`\`\`

That is the **only** thing that makes a code block. Styling text as monospace,
using a "Code" paragraph style, or using Google Docs' own code-block chunk will
not do it — the text imports as ordinary paragraphs. This is deliberate: a
guess that is right most of the time would sometimes swallow your prose into a
code box, and a missed block is much easier to spot and fix than a wrong one.

- **Languages we colour:** Python, JavaScript, TypeScript, SQL, JSON, Bash, R,
  Java, C, C++, HTML, CSS, YAML. A name we do not recognise imports as plain
  text, and the dialog tells you which one it was.
- A bare \`\`\` with no language is fine — use it for output, logs and file
  trees. You can set a language later in the editor.
- Formatting inside a fence is ignored. Bold, colour and links in code do not
  survive, by design.
- Indent with spaces or tabs; both come through.
- The multi-language tabbed code block is an editor-only feature. Import the
  snippets first, then combine them into tabs in the editor.

**If Google Docs keeps reformatting your fences as you type**, turn off
Tools > Preferences > Automatically detect Markdown. Or use \`~~~\` instead of
\`\`\`, which Docs leaves alone — it works exactly the same way.

## 5. After importing

The import **replaces everything** currently in the Content tab. The dialog
warns you when the post already has content, and the replacement is undoable
with Ctrl+Z while you are still in the editor.

1. Read through the imported post and check it survived the trip.
2. Set image widths and code-block languages where you want them.
3. Press **Save**. Until you do, nothing has been written to the blog.

## 6. Troubleshooting

**Everything came in as one long run of paragraphs** — the doc uses styled text
rather than real heading styles. Set them with Format > Paragraph styles >
Heading 2. Google Docs' "Title" and "Subtitle" styles are not headings and do
not import as such.

**The title appears twice on the live page** — the leading Heading 1 was kept.
Delete it in the editor, or re-import with the checkbox ticked.

**An image is missing** — check the warnings in the dialog. It was probably over
4 MB or in an unsupported format.

**My code imported as ordinary paragraphs** — the fences are missing, mistyped,
or Google Docs reformatted them as you typed. Each fence must sit alone on its
own line with nothing else on it. See section 4.

**A code block ran on and ate the rest of the post** — its closing fence is
missing. The import stops an unclosed block at the next heading, and the dialog
names the block that was left open.

**Nothing appears in the contents sidebar** — it is built from Heading 2 and
Heading 3. A post written entirely in Heading 1s has nothing to list.
`;
