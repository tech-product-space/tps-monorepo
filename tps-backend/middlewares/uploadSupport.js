const multer = require("multer");

const storage = multer.memoryStorage();

// Support ticket attachments are screenshots/docs, not large media — cap
// well below the global upload limit to avoid bloating memory/S3.
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max per file
});

module.exports = upload;
