/**
 * Manual script — `node src/test/certificateRender.test.js`
 *
 * Hits real S3: uploads a stand-in background under a temp key, renders a
 * certificate through the real service, writes the PDF next to this file, then
 * deletes the temp object. Nothing touches the database.
 *
 * Exercising the real path on purpose — getObjectBuffer, the font registry and
 * the shrink-to-fit are all new, and a test that stubs them proves nothing.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createCanvas } from "@napi-rs/canvas";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import s3 from "../config/awsS3.js";
import { putObject } from "../util/s3.js";
import { initCertificateFonts } from "../services/event/certificateFonts.js";
import { CERTIFICATE_PAGE_WIDTH_PT } from "../config/constants/eventCertificate.js";
import {
  PREVIEW_DATA,
  renderCertificate,
  resolveOrientation,
} from "../services/event/certificateRender.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WIDTH = 1600;
const HEIGHT = 1131;
const KEY = `tmp/certificate-render-test-${Date.now()}.png`;

const makeBackground = () => {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f7f3ea";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = "#c9a227";
  ctx.lineWidth = 14;
  ctx.strokeRect(48, 48, WIDTH - 96, HEIGHT - 96);

  return canvas.toBuffer("image/png");
};

const run = async () => {
  initCertificateFonts();

  console.log(`\nUploading stand-in background -> ${KEY}`);
  await putObject({
    key: KEY,
    body: makeBackground(),
    contentType: "image/png",
    isPrivate: true,
  });

  const template = {
    canvasWidth: WIDTH,
    canvasHeight: HEIGHT,
    backgroundKey: KEY,
    fields: [
      {
        key: "recipientName",
        x: 50,
        y: 46,
        fontSize: 72,
        color: "#1a1a1a",
        align: "center",
        fontWeight: "bold",
        // Names a real family so the substitution warning is exercised, and
        // sets a max width the long preview name cannot fit at 72px so
        // shrink-to-fit is exercised too. Both are the silent failures this
        // service exists to make loud.
        fontFamily: "Playfair Display",
        maxWidth: 30,
      },
      { key: "eventTitle", x: 50, y: 60, fontSize: 32, color: "#555555", align: "center" },
      { key: "issuedDate", x: 25, y: 86, fontSize: 24, color: "#666666", align: "center" },
      { key: "certificateNo", x: 75, y: 86, fontSize: 20, color: "#999999", align: "center" },
      // Not a real placeholder — should be skipped with a warning, never drawn
      // as "undefined".
      { key: "bogusKey", x: 10, y: 10, fontSize: 20, color: "#000000" },
    ],
  };

  const { pdf, warnings } = await renderCertificate({
    template,
    data: { ...PREVIEW_DATA, eventTitle: "AI Product Teardown — August 2026" },
  });

  const out = path.join(__dirname, "certificate-render-test.pdf");
  fs.writeFileSync(out, pdf);

  const header = pdf.subarray(0, 5).toString();
  const aspect = WIDTH / HEIGHT;

  console.log("\n--- result ---");
  console.log("bytes      :", pdf.length);
  console.log("magic      :", header, header === "%PDF-" ? "OK" : "NOT A PDF");
  const pageWidth = CERTIFICATE_PAGE_WIDTH_PT[resolveOrientation(template)];
  console.log("page (pt)  :", pageWidth, "x", Math.round(pageWidth / aspect));
  console.log("written to :", out);

  console.log("\n--- warnings ---");
  if (!warnings.length) console.log("  (none)");
  warnings.forEach((w) => console.log("  -", w));

  await s3.send(
    new DeleteObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: KEY }),
  );
  console.log("\nTemp background deleted.\n");
};

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
