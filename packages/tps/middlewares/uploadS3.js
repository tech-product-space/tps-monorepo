const psEnv = require("@ps/env/tps");
const multer = require("multer");
const multerS3 = require("multer-s3");
const path = require("path");
const s3 = require("../config/aws");

const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: psEnv.AWS_BUCKET_NAME,
        acl: "public-read",
        metadata: (req, file, cb) => {
            cb(null, { fieldName: file.fieldname });
        },
        key: (req, file, cb) => {
            const ext = path.extname(file.originalname);
            const filename = `files/${file.originalname}`;
            cb(null, filename);
        },
    }),
    fileFilter: (req, file, cb) => {
        cb(null, true); // Allow everything
    }
});

module.exports = upload;
