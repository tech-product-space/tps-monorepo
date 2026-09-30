# Certificate fonts

These files are the **only** fonts a certificate can be rendered with. One
static `.ttf` per weight, named `<Family>-<weight>.ttf`.

| Family | Category | Weights | Source |
|---|---|---|---|
| Inter | Sans serif | 300 400 500 600 700 900 | <https://fonts.google.com/specimen/Inter> |
| Montserrat | Sans serif | 300 400 500 600 700 800 | <https://fonts.google.com/specimen/Montserrat> |
| Playfair Display | Serif | 400 500 600 700 800 900 | <https://fonts.google.com/specimen/Playfair+Display> |
| EB Garamond | Serif | 400 500 600 700 800 | <https://fonts.google.com/specimen/EB+Garamond> |
| Cinzel | Display | 400 500 600 700 800 900 | <https://fonts.google.com/specimen/Cinzel> |
| Great Vibes | Script | 400 | <https://fonts.google.com/specimen/Great+Vibes> |
| Roboto Mono | Monospace | 400 500 700 | <https://fonts.google.com/specimen/Roboto+Mono> |

33 files, ~6.3MB. All SIL Open Font License, so they belong in the repo.

**Keep the filenames exactly as above** — `CERTIFICATE_FONTS` in
`config/constants/eventCertificate.js` names every file, and a rename means a
startup warning and a certificate in the wrong typeface.

## Refetching them

Google Fonts serves static per-weight TTFs to a legacy user agent. That is how
these were fetched, and it is the way to add a weight or a family:

```sh
curl -A "Mozilla/4.0" "https://fonts.googleapis.com/css2?family=Inter:wght@300;400"
# each @font-face block gives one weight and one .ttf url on fonts.gstatic.com
```

Then add the file to the `faces` map for that family in the constants file.
Nothing is discovered by scanning the directory.

## Static files per weight, not one variable font

The obvious economy is a single variable `.ttf` per family. It does not work:
`@napi-rs/canvas` registers a variable font happily and then renders every
weight identically, because it does not set the `wght` axis. Measuring the same
string at 100 and at 900 returns the same width.

Static faces do work. With all six Inter files registered under the one family
alias, each weight measures differently and `bold` resolves to exactly the same
face as `700`. That is why `fontWeight` is stored as a CSS number.

## Why these families

- **Playfair Display / EB Garamond** — serifs with real contrast, which is what
  makes a certificate look like a certificate. Playfair is the default for the
  recipient's name.
- **Cinzel** — Roman capitals, for titles and headings on formal certificates.
- **Great Vibes** — a script face for signature lines. Single weight by design.
- **Inter / Montserrat** — neutral sans for titles and dates; they stay legible
  at small sizes where a display face turns to mush.
- **Roboto Mono** — for the certificate number. A monospace makes an
  alphanumeric code easy to read back character by character, which matters when
  someone is verifying one by hand.

## Why this cannot be skipped

A canvas renderer asked for a font it does not have does **not** throw. It
substitutes silently, and the certificate comes out looking wrong with no error
anywhere. Relying on system fonts means it looks right on a developer's machine
and wrong in the Linux container — which is exactly how the TPS implementation
shipped. TPS offered `serif` / `sans-serif` / `cursive` in its editor, bundled
nothing, and never called `registerFont`.

This is also why the editor's "System default" is not a system font. It maps to
`CERTIFICATE_DEFAULT_FONT_FAMILY`, a bundled family, so it renders the same
everywhere.

On boot, `initCertificateFonts()` logs every file it could not find and every
family that ended up with no faces.
`POST /events/certificates/admin/:eventId/preview` returns the same information
in an `X-Certificate-Warnings` header — including a weight the family does not
ship — so an admin finds out at design time rather than after fifty
certificates have gone out.

## Do not use the web fonts from `gradient-next-ui/public/fonts`

Those are **subsetted** `.woff2` files built for the marketing site. A subset
drops glyphs, so a recipient whose name carries an accent renders as blank
boxes.
