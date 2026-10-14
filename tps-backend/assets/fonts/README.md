# TPS certificate fonts

These static fonts are bundled with the backend and registered by
`utils/certificateFonts.js` before creating a certificate canvas. Deploy this
directory with the application; no system font installation is required.

The editor's generic families map to EB Garamond (serif), Inter (sans-serif),
Roboto Mono (monospace), and Great Vibes (cursive). Unknown families use Inter.
The first three use bold faces; Great Vibes uses its available regular face.
Browser previews still use browser fonts, so their typography may differ.

Files were copied from `gradient-backend/src/assets/fonts` in this workspace.
Each family's SIL Open Font License is included alongside its font. Upstream:
https://github.com/google/fonts/tree/main/ofl

This fixes newly rendered course and event certificates, which share a renderer.
Already stored certificate PNGs must be regenerated separately, preserving their
original recipient, certificate ID, and issue date.
