// The authoring guide the import dialogs offer as a download, written once.
//
// Lessons and guide steps import through the same splitter, so they need the
// same instructions — the document rules do not change because the rows land in
// a different table. Only the nouns differ, and they are arguments.

export interface ImportGuideOptions {
  /** One row, lowercase singular: "lesson", "step". */
  noun: string;
  /** The same, capitalised: "Lesson", "Step". */
  Noun: string;
  /** What they land in, as a phrase: "a course module", "a project guide". */
  parent: string;
}

export const importGuideFilename = ({ Noun }: Pick<ImportGuideOptions, "Noun">) =>
  `${Noun}-Import-Guide.md`;

export const buildImportGuide = ({ noun, Noun, parent }: ImportGuideOptions) =>
  `# Formatting a Google Doc for ${noun} import

This guide explains how to write a Google Doc so it imports cleanly into
${parent}. When you are done, export with **File > Download > Microsoft Word
(.docx)** and drop the file into the "Import ${Noun}s" dialog. Imported ${noun}s
are always added as **drafts**, and you get a preview before anything is saved.

## 1. Splitting the document into ${noun}s

Each **Heading 1** starts a new ${noun} (you can switch this to Heading 2 in the
dialog). The heading text becomes the ${noun} title. Everything under a heading,
until the next one, becomes that ${noun}'s content.

- Use the real heading styles (Format > Paragraph styles > Heading 1/2), not
  just bold, enlarged text. Text that merely *looks* like a heading will not
  split the document.
- The split level is followed **strictly**. If you pick Heading 2, only Heading 2
  starts a ${noun} — a Heading 1 in the middle stays as content inside whichever
  ${noun} it falls in, and does not split anything.
- Anything before the first heading of the chosen level is **skipped**, not
  imported. The dialog tells you what was left out. Put it under a heading if it
  should be a ${noun} of its own.

## 2. What comes across

| In your doc              | Becomes in the ${noun}      |
|--------------------------|----------------------------|
| The heading level you pick | ${Noun} title (split point) |
| Any other heading level    | Section heading in the ${noun} |
| Normal paragraph       | Paragraph                 |
| Bold / italic / links  | Kept                      |
| Bullet / numbered list | List                      |
| Table                  | Table                     |
| Image                  | Image (uploaded for you)  |
| Code between \`\`\` fences | Code block (see section 4) |

Colours, fonts, and spacing are not carried over — ${noun}s use the site's own
styling.

## 3. Images

Images are pulled out of the document and uploaded automatically, so you do not
need to host them anywhere first.

- Keep each image under **4 MB**. Anything larger is skipped, and the dialog
  tells you which one.
- PNG, JPG, GIF, WebP, BMP and TIFF are supported. Other formats are skipped.
- Paste images directly into the Doc rather than linking them.

## 4. Code

Wrap code in fence lines. The opening fence names the language, the closing one
is bare, and both sit on their own line:

    \`\`\`python
    df = pd.read_csv("sales.csv")
    print(df.head())
    \`\`\`

### The two rules

**1. Every opening fence needs a closing one.** An opening \`\`\` with no
closing \`\`\` is not a code block at all — nothing is guessed, nothing is
created, and the import leaves that part of the document exactly as you wrote
it. The dialog tells you which block was left open so you can add the missing
line and import again.

**2. Between a matched pair, everything becomes code — no matter what.** How
you formatted it makes no difference: plain paragraphs, Shift+Enter line
breaks, a bullet list, coloured or bold text, or Google Docs' grey code box
(Insert > Building blocks > Code block). The two fences do not even have to be
in the same one — the opener can be a paragraph and the closer can sit inside
the code box. If both fences are there, what is between them is the code block.

The one exception is a real **Heading 1/2/3**. Headings are what split the
document into ${noun}s, so one is never swallowed into a code block; if a
heading sits between your fences, you get the "no closing fence" warning
instead. That only happens if a line of code was accidentally styled as a
heading.

### Details

- **Each fence must be alone on its line.** \`Run \`\`\`x = 1\`\`\` now\` in
  the middle of a sentence stays a sentence, backticks and all.
- **Fences are the only signal.** Monospace font, a "Code" paragraph style, or
  the grey code box *without* fences will not make a code block — that text
  imports as ordinary paragraphs. This is deliberate: a guess that is right
  most of the time would sometimes swallow your prose into a code box, and a
  missed block is much easier to spot than a wrong one.
- **Languages we colour:** Python, JavaScript, TypeScript, SQL, JSON, Bash, R,
  Java, C, C++, HTML, CSS, YAML. Capitals and common short names are fine —
  \`Python\`, \`py\`, \`JS\`, \`c++\`, \`yml\` all work. A name we do not
  recognise imports as plain text, and the dialog says which one it was.
- A bare \`\`\` with no language is fine — use it for output, logs and file
  trees. You can set a language later in the editor.
- Formatting inside a fence is ignored. Bold, colour and links in code do not
  survive, by design.
- Indent with spaces or tabs; both come through.
- Blank lines inside a block are kept.

**If Google Docs keeps reformatting your fences as you type**, turn off
Tools > Preferences > Automatically detect Markdown. Or use \`~~~\` instead of
\`\`\`, which Docs leaves alone — it works exactly the same way.

## 5. After importing

Every imported ${noun} is a **draft**:

1. Open each ${noun} and check the content survived the trip.
2. Fix the title and slug if the heading text was not what you wanted.
3. Publish the ${noun} when it is ready.

Nothing you import is visible on the public site until you publish it.

## 6. Troubleshooting

**"No headings found"** — the document uses styled text rather than real
heading styles, or you picked the wrong split level. Set Heading 1 properly, or
switch the dialog to Heading 2. Note that Google Docs' "Title" and "Subtitle"
styles are not headings and will not split the document.

**A ${noun} swallowed the ones after it** — a heading in the middle is not using
the real heading style, or it is a different level from the one you chose. The
splitter only reacts to the exact level selected in the dialog.

**The first chunk of the doc is missing** — it sat before the first heading of
the chosen level, so it was skipped. Give it a heading.

**An image is missing** — check the warnings in the dialog. It was probably over
4 MB or in an unsupported format.

**My code imported as ordinary paragraphs** — three things do this, and the
dialog's warnings say which: the closing \`\`\` is missing, a fence is not
alone on its line, or Google Docs reformatted the backticks as you typed. Each
fence must sit alone on its own line with nothing else on it. See section 4.

**Only some of my code blocks came through** — check the fences in between.
An opening fence with no closing one is skipped entirely, and the block after
it is usually fine, so a document with one bad pair imports partly. The
warnings name every block that was left open.
`;
