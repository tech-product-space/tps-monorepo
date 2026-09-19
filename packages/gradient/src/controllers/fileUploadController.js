import psEnv from "@ps/env/gradient";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import s3 from "../config/awsS3.js";

const ALLOWED_TYPES = ["blog", "event", "resource" , "free-course", "course", "project"]

const MAX_FILE_SIZE_MB = 5;

export const uploadFile = async (req, res) => {
  try {
    const { type } = req.params;
    const { entityId } = req.body;

    // ✅ Validate type
    if (!ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({
        message: `Invalid type. Must be ${ALLOWED_TYPES.join(" | ")}`,
      });
    }

    if (!entityId) {
      return res.status(400).json({
        message: "entityId is required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "No file uploaded.",
      });
    }

    const file = req.file;
    const timestamp = Date.now();
    const sanitizedFileName = file.originalname.replace(/\s+/g, "-");

    // ✅ Dynamic folder
    const key = `${type}/${entityId}/${timestamp}-${sanitizedFileName}`;

    const uploadParams = {
      Bucket: psEnv.AWS_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    await s3.send(new PutObjectCommand(uploadParams));

    res.status(200).json({
      message: "File uploaded successfully",
      key,
    });

  } catch (error) {
    console.error("S3 Upload Error:", error);

    res.status(500).json({
      message: "Upload failed",
      error: error.message,
    });
  }
};

export const deleteFile = async (req, res) => {
  try {
    const { key } = req.body;

    if (!key) {
      return res.status(400).json({
        message: "File key is required",
      });
    }

    const deleteParams = {
      Bucket: psEnv.AWS_BUCKET_NAME,
      Key: key,
    };

    await s3.send(new DeleteObjectCommand(deleteParams));

    res.status(200).json({
      message: "File deleted successfully",
      deletedKey: key,
    });

  } catch (error) {
    console.error("S3 Delete Error:", error);

    res.status(500).json({
      message: "Delete failed",
      error: error.message,
    });
  }
};


export const uploadResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }

    const file = req.file;

    if (file.mimetype !== "application/pdf") {
      return res.status(400).json({
        message: "Only PDF files are allowed",
      });
    }

    // ✅ Validate size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      return res.status(400).json({
        message: `File size must be less than ${MAX_FILE_SIZE_MB}MB`,
      });
    }

    const timestamp = Date.now();
    const sanitizedFileName = file.originalname.replace(/\s+/g, "-");

    const key = `resumes/externalJobs/${timestamp}-${sanitizedFileName}`;

    const uploadParams = {
      Bucket: psEnv.AWS_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    await s3.send(new PutObjectCommand(uploadParams));

    return res.status(200).json({
      message: "Resume uploaded successfully",
      key,
    });

  } catch (error) {
    console.error("Resume Upload Error:", error);

    return res.status(500).json({
      message: "Upload failed",
      error: error.message,
    });
  }
};