import axios from "axios";
import { PrivateAxios, PrivateBlogsAxios } from "@/helpers/PrivateAxios";


export const uploadWrittenCourseFile = async (file: File, courseId: string) => {
  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB in bytes

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Image size must not exceed 2 MB.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("courseId", courseId);
  
  const response = await PrivateBlogsAxios.post("/upload/written-course", formData);
  return response.data;
};

// Images pulled out of an imported document, uploaded to the same endpoint as the
// editor's image button.
//
// Two differences from uploadWrittenCourseFile, both deliberate:
//  - The 2 MB cap there is a client-side rule aimed at hand-picked images. Photos
//    embedded in a Word/Google doc routinely exceed it and the API takes 100 MB.
//  - The API puts `originalname` into the S3 key unsanitised (unlike its sibling
//    handlers), and resolveStorageUrl string-concats without encoding — so a name
//    with a space, "?" or "#" silently breaks the image. Names are generated and
//    sanitised here rather than trusting whatever the document carried.
export const IMPORT_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const uploadWrittenCourseImportImage = async (
  bytes: ArrayBuffer,
  contentType: string,
  fileName: string,
  courseId: string,
): Promise<{ key: string; fileUrl: string }> => {
  if (bytes.byteLength > IMPORT_IMAGE_MAX_BYTES) {
    throw new Error(
      `Image is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB; the limit is ${IMPORT_IMAGE_MAX_BYTES / 1024 / 1024} MB.`,
    );
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const file = new File([bytes], safeName, { type: contentType });

  const formData = new FormData();
  formData.append("file", file);
  formData.append("courseId", courseId);

  const response = await PrivateBlogsAxios.post(
    "/upload/written-course",
    formData,
  );
  const fileUrl: string = response.data?.fileUrl;
  if (!fileUrl) throw new Error("Upload succeeded but returned no fileUrl.");

  // The API returns only { message, fileUrl } — no key. ImageBlock reconstructs
  // it from the last path segment; mirror that exactly so both paths agree.
  const key = `written-course/${courseId}/${fileUrl.split("/").pop()}`;
  return { key, fileUrl };
};

export const deleteWrittenCourseFile = async (key: string) => {
  const response = await PrivateAxios.delete("/upload/written-course", {data: {key}} );
  return response.data;
};

export const uploadWrittenCourseVideo = async (
  file: File,
  courseId: string,
  onProgress?: (pct: number) => void,
) => {
  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Video size must not exceed 2 MB.");
  }

  const presignRes = await PrivateAxios.post(
    "/upload/written-course/presign-video",
    {
      courseId,
      fileName: file.name,
      contentType: file.type || "video/mp4",
    },
  );

  const { uploadUrl, key, fileUrl } = presignRes.data as {
    uploadUrl: string;
    key: string;
    fileUrl: string;
  };

  await axios.put(uploadUrl, file, {
    headers: { "Content-Type": file.type || "video/mp4" },
    onUploadProgress: (e) => {
      if (!onProgress || !e.total) return;
      onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });

  return { key, fileUrl };
};
