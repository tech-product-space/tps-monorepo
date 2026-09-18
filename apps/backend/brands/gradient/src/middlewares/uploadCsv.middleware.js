import multer from "multer";

/**
 * A CSV upload, held in memory.
 *
 * The same `multer.memoryStorage()` as `uploadS3.js` — which is not actually
 * S3-bound despite the name — with two differences that matter:
 *
 *   - **1 MB, not 20 MB.** A contact CSV that large is around 20,000 rows; past
 *     that the parse and the insert both belong in a job rather than a request.
 *   - **A file filter**, so a 400 says "that is not a CSV" instead of the parser
 *     failing halfway through a PDF with an unreadable error.
 *
 * The filter checks the **extension**, not just the mimetype. Browsers report a
 * `.csv` as `text/csv`, `application/csv`, `application/vnd.ms-excel` (any
 * machine with Excel installed, which is all of them) or `text/plain` depending
 * on the OS — rejecting on mimetype alone bounces perfectly good files from
 * exactly the people who make contact lists.
 */
const CSV_MIME_TYPES = [
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/octet-stream",
];

const MAX_FILE_SIZE = 1 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const hasCsvExtension = /\.csv$/i.test(file.originalname || "");
    const hasCsvMime = CSV_MIME_TYPES.includes(file.mimetype);

    if (hasCsvExtension || hasCsvMime) return cb(null, true);

    const error = new Error("Only .csv files can be uploaded");
    error.statusCode = 400;
    return cb(error);
  },
});

/**
 * `upload.single("file")` with multer's own errors mapped to 400.
 *
 * A `MulterError` carries a `code` and no `statusCode`, so the global handler
 * would return 500 for an over-size file — a server fault for something the
 * uploader did, and a message that does not mention the size limit.
 */
export const uploadCsv = (field = "file") => {
  const handler = upload.single(field);

  return (req, res, next) =>
    handler(req, res, (err) => {
      if (!err) return next();

      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message: `That file is larger than ${MAX_FILE_SIZE / 1024 / 1024} MB. Split it and upload in parts.`,
        });
      }

      if (err.statusCode) {
        return res.status(err.statusCode).json({ message: err.message });
      }

      return next(err);
    });
};

export default uploadCsv;
