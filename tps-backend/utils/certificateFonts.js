const path = require("path");
const { registerFont } = require("canvas");

// Match the four choices offered by the TPS certificate editor. Explicit
// bundled faces avoid missing-glyph boxes on servers without system fonts.
const faces = {
  serif: { family: "TPS Certificate Serif", file: "EBGaramond-700.ttf", weight: "bold" },
  "sans-serif": { family: "TPS Certificate Sans", file: "Inter-700.ttf", weight: "bold" },
  monospace: { family: "TPS Certificate Mono", file: "RobotoMono-700.ttf", weight: "bold" },
  cursive: { family: "TPS Certificate Script", file: "GreatVibes-400.ttf", weight: "normal" },
};
let initialized = false;

function initCertificateFonts() {
  if (initialized) return;
  for (const { family, file, weight } of Object.values(faces)) {
    // Fail generation if assets are missing instead of issuing a broken image.
    registerFont(path.join(__dirname, "../assets/fonts", file), { family, weight });
  }
  initialized = true;
}

function certificateFont(fontFamily, fontSize) {
  const face = Object.hasOwn(faces, fontFamily) ? faces[fontFamily] : faces["sans-serif"];
  return `${face.weight} ${fontSize}px "${face.family}"`;
}

module.exports = { initCertificateFonts, certificateFont };
