import { S3Client } from "@aws-sdk/client-s3";
// Imported for its side effect: env.js calls dotenv.config(). The client below
// reads process.env at module scope, so an entry point that reaches this file
// before dotenv has run gets a client with empty credentials — and the failure
// surfaces much later as "Resolved credential object is not valid" on the first
// upload. app.js happens to import env.js before the routers; scripts and
// workers have no such guarantee.
import "./env.js";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export default s3;