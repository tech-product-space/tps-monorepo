// Read-only end-to-end: real template from the DB, real S3 background, real
// fonts, real PDF. Exactly what POST /preview does minus Express.
import fs from "fs";
import db from "./src/database/postgres/models/index.js";
import { initCertificateFonts } from "./src/services/event/certificateFonts.js";
import { PREVIEW_DATA, renderCertificate, resolveOrientation } from "./src/services/event/certificateRender.service.js";

initCertificateFonts();

const { EventCertificateTemplate } = db;
const template = await EventCertificateTemplate.findOne();

console.log("template:", template.name, `${template.canvasWidth}x${template.canvasHeight}`);
console.log("stored orientation:", template.orientation, "-> resolved:", resolveOrientation(template));
console.log("fields:", JSON.stringify(template.fields));

// Exercise the new weights and a family that lacks the weight asked for.
const stress = {
  ...template.toJSON(),
  fields: [
    { key: "recipientName", x: 50, y: 40, fontSize: 72, color: "#111", fontFamily: "Great Vibes", fontWeight: 700, align: "center", maxWidth: 70 },
    { key: "eventTitle",    x: 50, y: 58, fontSize: 30, color: "#444", fontFamily: "Cinzel",      fontWeight: 600, align: "center", maxWidth: 80 },
    { key: "issuedDate",    x: 25, y: 86, fontSize: 20, color: "#666", fontFamily: "EB Garamond", fontWeight: 500, align: "center" },
    { key: "certificateNo", x: 75, y: 86, fontSize: 16, color: "#999", fontWeight: "bold",        align: "center" }, // legacy + system default
  ],
};

for (const [label, tpl] of [["stored", template], ["stress", stress]]) {
  const t0 = Date.now();
  const { pdf, warnings } = await renderCertificate({
    template: tpl,
    data: { ...PREVIEW_DATA, eventTitle: "AI Product Teardown — August 2026" },
  });
  const out = `preview-${label}.pdf`;
  fs.writeFileSync(out, pdf);
  console.log(`\n[${label}] ${pdf.length} bytes in ${Date.now() - t0}ms -> ${out} magic=${pdf.subarray(0,5)}`);
  console.log(`[${label}] warnings:`, warnings.length ? warnings : "(none)");
}

process.exit(0);
