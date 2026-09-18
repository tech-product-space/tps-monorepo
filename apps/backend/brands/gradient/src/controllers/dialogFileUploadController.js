import {
  PutObjectCommand,
  ListObjectsV2Command
} from "@aws-sdk/client-s3";
import s3 from "../config/awsS3.js";

const DIALOG_FOLDER = "media-assets";
const ALLOWED_SUBTYPES = ["event", "blog", "resource", "job", "recording", "project"];

export const uploadDialogImage = async (req, res) => {
  try {
    const { type } = req.params;

    // Validate subtype
    if (!ALLOWED_SUBTYPES.includes(type)) {
      return res.status(400).json({
        message: `Invalid type. Must be one of: ${ALLOWED_SUBTYPES.join(" | ")}`,
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }

    const file = req.file;
    const timestamp = Date.now();
    const sanitizedFileName = file.originalname.replace(/\s+/g, "-");

    const key = `${DIALOG_FOLDER}/${type}/${timestamp}-${sanitizedFileName}`;

    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    await s3.send(new PutObjectCommand(uploadParams));


    return res.status(200).json({
      message: "Dialog image uploaded successfully",
      key,
      type
    });
  } catch (error) {
    console.error("Dialog S3 Upload Error:", error);
    return res.status(500).json({
      message: "Upload failed",
      error: error.message,
    });
  }
};

export const getDialogImages = async (req, res) => {
  try {
    const { type } = req.params;

    // Validate subtype
    if (!ALLOWED_SUBTYPES.includes(type)) {
      return res.status(400).json({
        message: `Invalid type. Must be one of: ${ALLOWED_SUBTYPES.join(" | ")}`,
      });
    }

    const prefix = `${DIALOG_FOLDER}/${type}/`;

    const listParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Prefix: prefix,
    };

    const response = await s3.send(new ListObjectsV2Command(listParams));

    // Filter out "folder" placeholder keys (keys that end with /)
    const objects = (response.Contents || []).filter(
      (obj) => !obj.Key.endsWith("/")
    );

    const images = objects.map((obj) => ({
      key: obj.Key,
      lastModified: obj.LastModified,
      size: obj.Size,
    }));

    return res.status(200).json({
      message: "Dialog images fetched successfully",
      type,
      count: images.length,
      images,
    });
  } catch (error) {
    console.error("Dialog S3 List Error:", error);
    return res.status(500).json({
      message: "Failed to fetch dialog images",
      error: error.message,
    });
  }
};