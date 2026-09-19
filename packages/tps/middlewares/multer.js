const multer = require("multer");

const storage = multer.memoryStorage(); // store in memory

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
});

module.exports = upload;