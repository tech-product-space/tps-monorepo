const multer = require("multer");
const path = require("path");

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (path.extname(file.originalname) !== ".csv") {
    return cb(new Error("Only CSV files are allowed"));
  }
  cb(null, true);
};

const uploadCsv = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = uploadCsv;