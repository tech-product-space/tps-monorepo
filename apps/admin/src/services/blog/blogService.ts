import { ParagraphContent, ImageContent, VideoContent } from "@/types/blog";
import { PrivateAxios, PrivateBlogsAxios } from "../../helpers/PrivateAxios";

interface BlogContent {
  type: "paragraph" | "image" | "video" | "videoUrl" | "youtube";
}

interface VideoUrlContent extends BlogContent {
  type: "videoUrl";
  src: string;
  alt: string;
  credit?: string;
  loop?: boolean;
}

interface YouTubeContent extends BlogContent {
  type: "youtube";
  src: string;
  alt: string;
  credit?: string;
  loop?: boolean;
}

export interface BlogData {
  title: string;
  author: string;
  publishedDate: Date;
  category: string;
  metaTitle: string;
  metaDesc: string;
  readTime: string;
  thumbnailSrc: string;
  thumbnailAlt: string;
  type: string;
  // "blog" (listed at /blogs) or "standalone" (served at root /<slug>)
  placement?: string;
  faqs?: { question: string; answer: string }[];
  url: string;
  content: (
    | ParagraphContent
    | ImageContent
    | VideoContent
    | VideoUrlContent
    | YouTubeContent
  )[];
}

export interface BlogDelete {
  key: string;
}

// ─── v2 (Tiptap) blog types ───────────────────────────────────────────────────
// v2 blogs reuse the same `blogs` table; the only schema addition is `version`.
// All v2-only fields live inside the `content` JSON column (see V2BlogContent).

export interface BlogAuthorDetails {
  name: string;
  company: string;
  designation: string;
  imgSrc: string;
  imgAlt: string;
}

export interface V2TocItem {
  id: string;
  level: number;
  textContent: string;
}

export interface V2BlogContent {
  doc: Record<string, unknown> | null; // Tiptap getJSON() document
  tableOfContents: V2TocItem[];
  subTitle: string;
  tags: string[];
  authorDetails: BlogAuthorDetails | null;
}

// What the backend stores/returns for a v2 blog row.
export interface BlogV2Data {
  blog_id?: number;
  version: 2;
  title: string;
  url: string;
  author?: string;
  category: string;
  publishedDate?: Date | string | null;
  readTime?: number;
  thumbnailSrc?: string;
  thumbnailAlt?: string;
  metaTitle?: string;
  metaDesc?: string;
  faqs?: { question: string; answer: string }[];
  featured?: boolean;
  recommended?: boolean;
  type?: string; // 'draft' | 'publish'
  placement?: string; // 'blog' | 'standalone'
  scheduledAt?: string | null;
  content: V2BlogContent;
}

export const checkSlugAvailability = async (slug: string, blogId?: string | number) => {
  const response = await PrivateAxios.get(`/blogs/slug-availability`, {
    params: { slug, ...(blogId ? { blogId } : {}) },
  });
  return response.data as { available: boolean };
};

export const getBlogs = async (
  page = 1,
  limit = 10,
  placement = "blog",
  search = "",
) => {
  const response = await PrivateAxios.get(`/blogs/admin/all-blogs`, {
    params: {
      page,
      limit,
      placement,
      ...(search.trim() ? { search: search.trim() } : {}),
    },
  });
  return response.data;
};

export const getBlogById = async (id: string) => {
  const response = await PrivateAxios.get(`/blogs/${id}`);
  return response.data;
};

export const updateBlog = async (requestbody: BlogData, id: string) => {
  const response = await PrivateAxios.put(`/blogs/edit/${id}`, requestbody);
  return response.data;
};

export const addBlog = async (requestbody: BlogData) => {
  const response = await PrivateAxios.post(`/blogs/add`, requestbody);
  return response.data;
};

export const deleteBlog = async (id: string) => {
  const response = await PrivateAxios.delete(`/blogs/delete/${id}`);
  return response.data;
};

export const deleteBlogFile = async (requestbody: BlogDelete) => {
  const response = await PrivateAxios.delete(`/upload/blogs`, {
    data: requestbody,
  });
  return response.data;
};

export const getAllBlogFiles = async () => {
  const response = await PrivateAxios.get(`/upload/blogs`);
  return response.data;
};

export const uploadBlogFile = async (file: File) => {
  const MAX_FILE_SIZE = 1.1 * 1024 * 1024; // 1.1 MB in bytes

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File size must not exceed 1.1 MB.");
  }

  const formData = new FormData();
  formData.append("file", file);
  
  const response = await PrivateBlogsAxios.post("/upload/blogs", formData);
  return response.data;
};

export const toggleFeaturedStatus = async (id: string) => {
  const response = await PrivateAxios.patch(`/blogs/featured/${id}`);
  return response.data;
};

export const toggleRecommendedStatus = async (id: string) => {
  const response = await PrivateAxios.patch(`/blogs/recommended/${id}`);
  return response.data;
};

export const getAllResumeFiles = async () => {
  const response = await PrivateAxios.get(`/upload/resume`);
  return response.data;
};

export const updateBlogPublishStatus = async (
  id: string,
  status: "publish" | "draft",
) => {
  const response = await PrivateAxios.post(`/blogs/${id}/publish`, {
    status,
  });
  return response.data;
};

export const schedulePublish = async (blogId: string, publishAt: string) => {
  const response = await PrivateAxios.post(`/blogs/schedule`, {
    blogId,
    publishAt,
  });
  return response.data;
};

export const cancelSchedulePublish = async (blogId: string) => {
  const response = await PrivateAxios.post(`/blogs/${blogId}/cancel`);
  return response.data;
};
