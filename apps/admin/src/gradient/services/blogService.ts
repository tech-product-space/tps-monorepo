import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";

const BLOG_BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/blogs/admin`;

interface BlogMeta {
  metaTitle?: string;
  metaDesc?: string;
}

export interface CreateBlogPayload {
  id?: string;
  title: string;
  category: string;
  url: string;
  subTitle?: string;
  seo?: BlogMeta;
}

export interface AuthorDetails {
  name: string;
  imgAlt: string;
  imgSrc: string;
  company: string;
  designation: string;
}

export interface FaqItem {
  index: number;
  question: string;
  answer: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  answerIndex: number; // index of the correct option within `options`
}

// Optional per-blog quiz. Scored client-side on the public site, no login.
export interface BlogQuiz {
  enabled: boolean;
  questions: QuizQuestion[];
}

export interface BlogResponse {
  id?: string;
  title: string;
  subTitle: string;
  authorDetails?: AuthorDetails;
  publishedDate?: string | null;
  category: string;
  tableOfContents?: unknown[];
  content?: Record<string, unknown>;
  tags?: string[];
  seo?: BlogMeta;
  readTime?: number;
  thumbnailSrc?: string;
  thumbnailAlt?: string;
  status?: "draft" | "published" | "scheduled";
  url: string;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  faq?: FaqItem[];
  quiz?: BlogQuiz;
  isFeatured: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export const blogService = {
  getAllBlogs: async () => {
    const response = await PrivateAxios.get(`${BLOG_BASE_URL}/blogs`);
    return response.data;
  },

  checkSlugAvailability: async (slug: string) => {
    const response = await PrivateAxios.get(
      `${BLOG_BASE_URL}/slug-availability`,
      {
        params: { slug },
      },
    );
    return response.data;
  },

  createBlog: async (data: CreateBlogPayload) => {
    const response = await PrivateAxios.post(`${BLOG_BASE_URL}/create`, data);
    return response;
  },

  getBlogById: async (id: string) => {
    const response = await PrivateAxios.get(`${BLOG_BASE_URL}/blogs/${id}`);
    return response.data;
  },

  getBlogContentById: async (id: string) => {
    const response = await PrivateAxios.get(
      `${BLOG_BASE_URL}/blogs-content/${id}`,
    );
    return response.data;
  },

  updateBlog: async (id: string, data: Partial<BlogResponse>) => {
    const response = await PrivateAxios.put(
      `${BLOG_BASE_URL}/blogs/${id}`,
      data,
    );
    return response.data;
  },

  toggleBlogStatus: async (id: string | undefined) => {
    const response = await PrivateAxios.patch(
      `${BLOG_BASE_URL}/blogs/${id}/toggle-status`,
    );
    return response.data;
  },

  deleteBlog: async (id: string) => {
    const response = await PrivateAxios.delete(`${BLOG_BASE_URL}/blogs/${id}`);
    return response.data;
  },
};
