const fs = require("node:fs/promises");
const path = require("node:path");
const { parseArgs } = require("node:util");
const { capitalizeName } = require("../utils/capitalize");

async function regenerate({ courseId, userId, output, upload = false }, deps) {
  const { models, render, writeFile, replaceImage } = deps;
  const { UserCourseCertificate, CourseCertificateTemplate, CourseEnrollment, users } = models;
  const certificate = await UserCourseCertificate.findOne({
    where: { course_id: courseId, user_id: userId },
  });
  if (!certificate) throw new Error("No existing certificate for this user and course");
  const template = await CourseCertificateTemplate.findOne({ where: { courseId } });
  if (!template) throw new Error("Course certificate template not found");
  const enrollment = await CourseEnrollment.findOne({
    where: { course_id: courseId, user_id: userId },
    include: [{ model: users, as: "user", attributes: ["name"] }],
  });
  const name = capitalizeName(enrollment?.name) || capitalizeName(enrollment?.user?.name);
  if (!name) throw new Error("Recipient name missing; repair the enrollment before regenerating");
  const issuedAt = new Date(certificate.createdAt);
  if (!certificate.certificate_id || !certificate.createdAt || Number.isNaN(issuedAt.getTime())) {
    throw new Error("Original certificate ID or issue date missing");
  }
  const png = await render(template, {
    name,
    certificateId: certificate.certificate_id,
    // Run on the backend host to use the same timezone as original issuance.
    date: issuedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
  });
  await writeFile(output, png, { flag: "wx" });
  const key = `certificates/free-course/${certificate.certificate_id}.png`;
  if (upload) await replaceImage(key, png, `${output}.previous.png`);
  return { output, uploaded: upload, certificateId: certificate.certificate_id };
}

async function main() {
  const { values } = parseArgs({ options: {
    "course-id": { type: "string" }, "user-id": { type: "string" },
    output: { type: "string" }, upload: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  } });
  if (values.help || !values["course-id"] || !values["user-id"] || !values.output) {
    console.log("From tps-backend, with the deployed backend environment:\n" +
      "node scripts/regenerateCourseCertificate.js --course-id COURSE_ID --user-id USER_ID --output preview.png\n" +
      "Inspect preview.png. To replace the stored image, repeat with --output repaired.png --upload.\n" +
      "Output files must not exist. Upload backs up the old S3 image beside the output. No records or emails are created.");
    if (!values.help) process.exitCode = 1;
    return;
  }
  require("dotenv").config();
  const models = require("../models");
  try {
    const { generateCertificateImage } = require("../utils/generateEventCertificate");
    const result = await regenerate({
      courseId: values["course-id"], userId: values["user-id"],
      output: path.resolve(values.output), upload: values.upload,
    }, {
      models, render: generateCertificateImage, writeFile: fs.writeFile,
      replaceImage: async (key, png, backupPath) => {
        const { GetObjectCommand } = require("@aws-sdk/client-s3");
        const s3 = require("../config/aws");
        const { uploadImageToS3 } = require("../lib/s3");
        const old = await s3.send(new GetObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: key }));
        await fs.writeFile(backupPath, Buffer.from(await old.Body.transformToByteArray()), { flag: "wx" });
        await uploadImageToS3(png, key, "image/png");
      },
    });
    console.log(result.uploaded ? "Stored certificate replaced; previous PNG backed up locally." : "Preview saved; stored certificate unchanged.");
    console.log(result.output);
  } finally {
    await models.sequelize.close();
  }
}

if (require.main === module) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { regenerate };
