const { PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const s3 = require("../config/aws");

// AI Products media. Stores under ai-products/ and returns the bucket-root
// key — clients persist the key and serve it via the assets domain
// (NEXT_PUBLIC_AWS_FILE_BASE_URL), not a hardcoded S3 URL.
exports.uploadAiProductFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded." });
        }

        const file = req.file;
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, "-");
        const key = `ai-products/${Date.now()}-${safeName}`;

        await s3.send(new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
        }));

        res.status(200).json({
            message: "File uploaded successfully",
            key,
            fileUrl: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
        });
    } catch (error) {
        console.error("S3 Upload Error:", error);
        res.status(500).json({ message: "Upload failed", error });
    }
};

// Thumbnails, speaker photos and "previously at" logos for session recordings.
//
// Modelled on uploadAiProductFile rather than uploadEventFile: the URL is built
// from the bucket and region already in the environment, so this needs no new
// AWS_*_BUCKET_URL variable to be set before it works in an environment that
// does not have one.
exports.uploadRecordingFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded." });
        }

        const file = req.file;
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, "-");
        const key = `recordings/${Date.now()}-${safeName}`;

        await s3.send(new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
        }));

        res.status(200).json({
            message: "File uploaded successfully",
            key,
            fileUrl: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
        });
    } catch (error) {
        console.error("S3 Upload Error:", error);
        res.status(500).json({ message: "Upload failed", error });
    }
};

// The media library behind the image picker.
//
// One endpoint over an allowlist of prefixes rather than one endpoint per
// feature: the picker shows tabs, and a tab that needs a new backend route is a
// tab nobody adds. The allowlist is what keeps `?type=` from turning into
// "list any prefix in the bucket", including the ones holding resumes.
const LIBRARY_PREFIXES = {
    recordings: "recordings/",
    events: "events/",
    blogs: "blogs/",
    "ai-products": "ai-products/",
    projects: "projects/",
};

const publicUrlFor = (key) =>
    `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

// How many keys the listing will walk before giving up. Generous enough that
// no folder hits it today, low enough that a runaway prefix cannot pull the
// whole bucket into one response.
const LIBRARY_MAX_KEYS = 3000;

// Only what a picker can render. A PDF tile is a broken image icon.
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|svg|avif)$/i;

exports.getLibraryFiles = async (req, res) => {
    try {
        const type = String(req.query.type || "recordings");
        const prefix = LIBRARY_PREFIXES[type];

        if (!prefix) {
            return res.status(400).json({
                message: `Unknown library type '${type}'. Allowed: ${Object.keys(LIBRARY_PREFIXES).join(", ")}`,
            });
        }

        // ListObjectsV2 returns at most 1000 keys per call, and `blogs/` is
        // already near that — a single call would have started silently
        // dropping the oldest files with nothing on screen to say so. Paged
        // through to a cap instead, and the cap is reported rather than hidden.
        const contents = [];
        let continuationToken;
        let truncated = false;

        do {
            const page = await s3.send(new ListObjectsV2Command({
                Bucket: process.env.AWS_BUCKET_NAME,
                Prefix: prefix,
                ContinuationToken: continuationToken,
            }));

            contents.push(...(page.Contents || []));
            continuationToken = page.NextContinuationToken;

            if (contents.length >= LIBRARY_MAX_KEYS) {
                truncated = Boolean(continuationToken);
                break;
            }
        } while (continuationToken);

        const files = contents
            // A "folder" placeholder is a zero-byte object whose key is the
            // prefix itself; it is not an image and must not render as a tile.
            .filter((file) => file.Size > 0 && IMAGE_EXTENSIONS.test(file.Key))
            .sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified))
            .map((file) => ({
                key: file.Key,
                name: file.Key.slice(prefix.length),
                url: publicUrlFor(file.Key),
                size: file.Size,
                lastModified: file.LastModified,
            }));

        res.status(200).json({
            message: "Files retrieved successfully",
            type,
            truncated,
            files,
        });
    } catch (error) {
        console.error("S3 List Error:", error);
        res.status(500).json({ message: "Failed to list files", error });
    }
};

// Deletes by full key, as returned by the listing above, and only inside a
// known prefix — so a caller cannot walk out of the library into, say, the
// resumes folder by passing a crafted key.
exports.deleteLibraryFile = async (req, res) => {
    try {
        const { key } = req.body;

        const allowed =
            typeof key === "string" &&
            Object.values(LIBRARY_PREFIXES).some((prefix) => key.startsWith(prefix));

        if (!allowed) {
            return res.status(400).json({
                message: "A library file key is required",
            });
        }

        await s3.send(new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
        }));

        res.status(200).json({
            message: "File deleted successfully",
            deletedKey: key,
        });
    } catch (error) {
        console.error("S3 Delete Error:", error);
        res.status(500).json({ message: "Delete failed", error });
    }
};

exports.uploadFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded." });
        }

        const file = req.file;
        const timestamp = Date.now();
        const fileName = `${timestamp}-${file.originalname}`;

        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `prod/${fileName}`,
            Body: file.buffer,
            ContentType: file.mimetype,
        };

        await s3.send(new PutObjectCommand(uploadParams));

        const fileUrl = `${process.env.AWS_PROD_BUCKET_URL}/${fileName}`;

        res.status(200).json({
            message: "File uploaded successfully",
            fileUrl,
        });
    } catch (error) {
        console.error("S3 Upload Error:", error);
        res.status(500).json({ message: "Upload failed", error });
    }
};

exports.uploadBlogsFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded." });
        }

        const file = req.file;
        const timestamp = Date.now();
        const fileName = `${timestamp}-${file.originalname}`;

        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `blogs/${fileName}`,
            Body: file.buffer,
            ContentType: file.mimetype,
        };

        await s3.send(new PutObjectCommand(uploadParams));

        const fileUrl = `${process.env.AWS_BLOG_BUCKET_URL}/${fileName}`;

        res.status(200).json({
            message: "File uploaded successfully",
            fileUrl,
        });
    } catch (error) {
        console.error("S3 Upload Error:", error);
        res.status(500).json({ message: "Upload failed", error });
    }
};

exports.getAllBlogFiles = async (req, res) => {
    try {
        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Prefix: "blogs/",
        };

        const data = await s3.send(new ListObjectsV2Command(params));

        if (!data.Contents || data.Contents.length === 0) {
            return res.status(200).json({ message: "No files found in blogs folder", files: [] });
        }

        const files = data.Contents.map(file => {
            const keyWithoutPrefix = file.Key.replace(/^blogs\//, "")
            return {
                key: keyWithoutPrefix,
                url: `${process.env.AWS_BLOG_BUCKET_URL}/${keyWithoutPrefix}`,
                size: file.Size,
                lastModified: file.LastModified,
            };
        });

        res.status(200).json({
            message: "Files retrieved successfully",
            files,
        });
    } catch (error) {
        console.error("S3 List Error:", error);
        res.status(500).json({ message: "Failed to list files", error });
    }
};

exports.deleteBlogFile = async (req, res) => {
    try {
        const { key } = req.body;

        if (!key) {
            return res.status(400).json({ message: "File key is required" });
        }

        const deleteParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `blogs/${key}`,
        };

        await s3.send(new DeleteObjectCommand(deleteParams));

        res.status(200).json({
            message: "File deleted successfully",
            deletedKey: key,
        });
    } catch (error) {
        console.error("S3 Delete Error:", error);
        res.status(500).json({ message: "Delete failed", error });
    }
};

exports.uploadResumeFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded." });
        }

        const file = req.file;
        const timestamp = Date.now();
        const fileName = `${timestamp}-${file.originalname}`;

        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `resume/${fileName}`,
            Body: file.buffer,
            ContentType: file.mimetype,
        };

        await s3.send(new PutObjectCommand(uploadParams));

        const fileUrl = `${process.env.AWS_RESUME_BUCKET_URL}/${fileName}`;

        res.status(200).json({
            message: "File uploaded successfully",
            fileUrl,
        });
    } catch (error) {
        console.error("S3 Upload Error:", error);
        res.status(500).json({ message: "Upload failed", error });
    }
};

exports.uploadJobApplicationResume = async (req, res) => {
    try {
        const { userId, jobId } = req.body;

        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded." });
        }

        if (!userId) {
            return res.status(400).json({ message: "userId is required." });
        }

        if (!jobId) {
            return res.status(400).json({ message: "jobId is required." });
        }

        const file = req.file;

        if (file.mimetype !== "application/pdf") {
            return res.status(400).json({ message: "Only PDF files are allowed." });
        }

        const MAX_SIZE = 10 * 1024 * 1024;

        if (file.size > MAX_SIZE) {
            return res.status(400).json({ message: "File size must be less than 10MB." });
        }

        const sanitizedName = file.originalname.replace(/\s+/g, "-");
        const timestamp = Date.now();
        const fileName = `${timestamp}-${sanitizedName}`;

        const s3Key = `resume/job-applications/${jobId}/${userId}/${fileName}`;

        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
            Body: file.buffer,
            ContentType: file.mimetype,
        };

        await s3.send(new PutObjectCommand(uploadParams));

        res.status(200).json({
            message: "Resume uploaded successfully",
            key: s3Key,
        });

    } catch (error) {
        console.error("S3 Upload Error:", error);
        res.status(500).json({ message: "Upload failed" });
    }
};

exports.uploadScholarshipApplicationResume = async (req, res) => {
    try {
        const { courseName } = req.body;

        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded." });
        }

        if (!courseName) {
            return res.status(400).json({ message: "courseName is required." });
        }

        const file = req.file;

        // ✅ Check MIME type
        if (file.mimetype !== "application/pdf") {
            return res.status(400).json({ message: "Only PDF files are allowed." });
        }

        // ✅ Check extension
        if (!file.originalname.toLowerCase().endsWith(".pdf")) {
            return res.status(400).json({ message: "Only PDF files are allowed." });
        }

        const MAX_SIZE = 10 * 1024 * 1024;

        if (file.size > MAX_SIZE) {
            return res.status(400).json({ message: "File size must be less than 10MB." });
        }

        const sanitizedName = file.originalname
            .toLowerCase()
            .replace(/[^a-z0-9.]/g, "-");

        const sanitizedCourseName = courseName
            .toLowerCase()
            .replace(/[^a-z0-9-_]/g, "-");

        const timestamp = Date.now();
        const fileName = `${timestamp}-${sanitizedName}`;

        const s3Key = `resume/scholarship/${sanitizedCourseName}/${fileName}`;

        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
            Body: file.buffer,
            ContentType: file.mimetype,
        };

        await s3.send(new PutObjectCommand(uploadParams));

        res.status(200).json({
            message: "Resume uploaded successfully",
            key: s3Key,
        });

    } catch (error) {
        console.error("S3 Upload Error:", error);
        res.status(500).json({ message: "Upload failed" });
    }
};

exports.deleteResumeFile = async (req, res) => {
    try {
        const { key } = req.body;

        if (!key) {
            return res.status(400).json({ message: "File key is required" });
        }

        const deleteParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `resume/${key}`,
        };

        await s3.send(new DeleteObjectCommand(deleteParams));

        res.status(200).json({
            message: "File deleted successfully",
            deletedKey: key,
        });
    } catch (error) {
        console.error("S3 Delete Error:", error);
        res.status(500).json({ message: "Delete failed", error });
    }
};

exports.getAllResumeFiles = async (req, res) => {
    try {
        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Prefix: "resume/",
        };

        const data = await s3.send(new ListObjectsV2Command(params));

        if (!data.Contents || data.Contents.length === 0) {
            return res.status(200).json({ message: "No files found in resume folder", files: [] });
        }

        const files = data.Contents.map(file => {
            const keyWithoutPrefix = file.Key.replace(/^resume\//, "");
            return {
                key: keyWithoutPrefix,
                url: `${process.env.AWS_RESUME_BUCKET_URL}/${keyWithoutPrefix}`,
                size: file.Size,
                lastModified: file.LastModified,
            };
        });

        res.status(200).json({
            message: "Resume files retrieved successfully",
            files,
        });
    } catch (error) {
        console.error("S3 Resume List Error:", error);
        res.status(500).json({ message: "Failed to list resume files", error });
    }
};

exports.uploadProjectFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded." });
        }

        const file = req.file;
        const timestamp = Date.now();
        const fileName = `${timestamp}-${file.originalname}`;

        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `projects/${fileName}`,
            Body: file.buffer,
            ContentType: file.mimetype,
        };

        await s3.send(new PutObjectCommand(uploadParams));

        const fileUrl = `${process.env.AWS_PROJECT_BUCKET_URL}/${fileName}`;

        res.status(200).json({
            message: "File uploaded successfully",
            fileUrl,
        });
    } catch (error) {
        console.error("S3 Upload Error:", error);
        res.status(500).json({ message: "Upload failed", error });
    }
};

exports.deleteProjectFile = async (req, res) => {
    try {
        const { key } = req.body;

        if (!key) {
            return res.status(400).json({ message: "File key is required" });
        }

        const deleteParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `projects/${key}`,
        };

        await s3.send(new DeleteObjectCommand(deleteParams));

        res.status(200).json({
            message: "File deleted successfully",
            deletedKey: key,
        });
    } catch (error) {
        console.error("S3 Delete Error:", error);
        res.status(500).json({ message: "Delete failed", error });
    }
};

exports.uploadEventFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded." });
        }

        const file = req.file;
        const timestamp = Date.now();
        const fileName = `${timestamp}-${file.originalname}`;

        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `events/${fileName}`,
            Body: file.buffer,
            ContentType: file.mimetype,
        };

        await s3.send(new PutObjectCommand(uploadParams));

        const fileUrl = `${process.env.AWS_EVENT_BUCKET_URL}/${fileName}`;

        res.status(200).json({
            message: "File uploaded successfully",
            fileUrl,
        });
    } catch (error) {
        console.error("S3 Upload Error:", error);
        res.status(500).json({ message: "Upload failed", error });
    }
};

exports.deleteEventFile = async (req, res) => {
    try {
        const { key } = req.body;

        if (!key) {
            return res.status(400).json({ message: "File key is required" });
        }

        const deleteParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `events/${key}`,
        };

        await s3.send(new DeleteObjectCommand(deleteParams));

        res.status(200).json({
            message: "File deleted successfully",
            deletedKey: key,
        });
    } catch (error) {
        console.error("S3 Delete Error:", error);
        res.status(500).json({ message: "Delete failed", error });
    }
};

/**
 * Public URL for an object, from its full S3 key.
 *
 * **Not `AWS_BLOG_BUCKET_URL`.** That variable is not the bucket root — it is
 * `https://<bucket>.s3.<region>.amazonaws.com/blogs`, the blog *prefix*, which
 * is why the blog handler appends only a file name to it. Appending a key that
 * already carries its own prefix produced `.../blogs/written-course/<id>/<file>`
 * for an object actually stored at `written-course/<id>/<file>`, and S3 answers
 * a request for a key that is not there — with no ListBucket permission — as
 * Access Denied rather than Not Found. Hence uploads that "worked" and images
 * that would not load.
 *
 * CloudFront first, because that is the origin the admin panel and the public
 * site already resolve stored keys through (`NEXT_PUBLIC_AWS_FILE_BASE_URL`), so
 * a block-editor image and a Tiptap image end up at the same URL. The S3 origin
 * is the fallback for an environment with no CDN configured.
 */
const publicUrlForKey = (key) => {
    const base = (
        process.env.AWS_ASSETS_CLOUDFRONT_DOMAIN ||
        `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com`
    ).replace(/\/$/, "");

    return `${base}/${key}`;
};

exports.uploadWrittenCourseFile = async (req, res) => {
    try {
        const { courseId } = req.body;

        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded." });
        }

        if (!courseId) {
            return res.status(400).json({ message: "course Id is required." });
        }

        const file = req.file;
        const timestamp = Date.now();
        const fileName = `${timestamp}-${file.originalname}`;

        const key = `written-course/${courseId}/${fileName}`;

        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
        };

        await s3.send(new PutObjectCommand(uploadParams));

        const fileUrl = publicUrlForKey(key);

        res.status(200).json({
            message: "File uploaded successfully",
            fileUrl,
        });
    } catch (error) {
        console.error("S3 Upload Error:", error);
        res.status(500).json({ message: "Upload failed", error });
    }
};

exports.deleteWrittenCourseFile = async (req, res) => {
    try {
        const key = req.body?.key

        if (!key) {
            return res.status(400).json({ message: "File key is required." });
        }

        const deleteParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `${key}`,
        };

        await s3.send(new DeleteObjectCommand(deleteParams));

        res.status(200).json({
            message: "File deleted successfully",
            deletedKey: key,
        });
    } catch (error) {
        console.error("S3 Delete Error:", error);
        res.status(500).json({ message: "Delete failed", error });
    }
}

exports.getWrittenCourseVideoPresignedUrl = async (req, res) => {
    try {
        const { courseId, fileName, contentType } = req.body;

        if (!courseId) {
            return res.status(400).json({ message: "courseId is required." });
        }
        if (!fileName) {
            return res.status(400).json({ message: "fileName is required." });
        }
        if (!contentType || !contentType.startsWith("video/")) {
            return res.status(400).json({ message: "A video contentType is required." });
        }

        const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
        const timestamp = Date.now();
        const key = `written-course/${courseId}/${timestamp}-${safeName}`;

        const command = new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
            ContentType: contentType,
        });

        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 60 * 15 }); // 15 min
        const fileUrl = publicUrlForKey(key);

        res.status(200).json({
            message: "Presigned URL generated",
            uploadUrl,
            key,
            fileUrl,
        });
    } catch (error) {
        console.error("S3 Presign Error:", error);
        res.status(500).json({ message: "Failed to generate presigned URL", error });
    }
};