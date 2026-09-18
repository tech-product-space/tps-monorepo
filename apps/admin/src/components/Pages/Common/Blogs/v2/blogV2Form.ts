// Shared shape + payload builder for the v2 blog editor. The editor lifts all
// tab state here so a single Save can persist everything in one updateBlog call.

import type { V2TocItem } from "@/services/blog/blogService";

export interface DetailsValues {
  title: string;
  subTitle: string;
  category: string;
  url: string;
  publishedDate: string; // yyyy-mm-dd
  readTime: number | string;
  metaTitle: string;
  metaDesc: string;
  thumbnailSrc: string;
  thumbnailAlt: string;
  authorName: string;
  authorCompany: string;
  authorDesignation: string;
  authorImgSrc: string;
  authorImgAlt: string;
  featured: boolean;
  recommended: boolean;
  placement: string;
  status: string; // 'draft' | 'publish'
}

export interface ContentData {
  doc: object | null;
  tableOfContents: V2TocItem[];
}

export interface Faq {
  question: string;
  answer: string;
}

// Optional per-blog quiz. Stored inside the `content` JSON (alongside doc/tags)
// under `content.quiz`. Scored client-side on the public site; no login needed.
export interface QuizQuestion {
  id: string;
  question: string;
  options: string[]; // up to 4 options
  answerIndex: number; // index of the correct option within `options`
}

export interface BlogQuiz {
  enabled: boolean;
  questions: QuizQuestion[];
}

export const emptyQuizQuestion = (): QuizQuestion => ({
  id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  question: "",
  options: ["", "", "", ""],
  answerIndex: 0,
});

// Turn free text (a title or typed url) into a clean dash-slug:
// lowercase, alphanumerics + dashes only. e.g. "How to Crack PM Interviews!"
// -> "how-to-crack-pm-interviews".
export function slugifyUrl(text: string): string {
  return text
    .toLowerCase()
    .replace(/&[a-z]+;/g, " ")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function toDateInput(value: unknown): string {
  if (!value || typeof value !== "string") return "";
  return value.includes("T") ? value.split("T")[0] : value.slice(0, 10);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function initDetails(blog: any): DetailsValues {
  const author = blog?.content?.authorDetails ?? {};
  return {
    title: blog?.title ?? "",
    subTitle: blog?.content?.subTitle ?? "",
    category: blog?.category ?? "",
    url: blog?.url ?? "",
    publishedDate: toDateInput(blog?.publishedDate),
    readTime: blog?.readTime ?? 0,
    metaTitle: blog?.metaTitle ?? "",
    metaDesc: blog?.metaDesc ?? "",
    thumbnailSrc: blog?.thumbnailSrc ?? "",
    thumbnailAlt: blog?.thumbnailAlt ?? "",
    authorName: author?.name ?? "",
    authorCompany: author?.company ?? "",
    authorDesignation: author?.designation ?? "",
    authorImgSrc: author?.imgSrc ?? "",
    authorImgAlt: author?.imgAlt ?? "",
    featured: !!blog?.featured,
    recommended: !!blog?.recommended,
    placement: blog?.placement ?? "blog",
    status: blog?.type ?? "draft",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function initContent(blog: any): ContentData {
  return {
    doc: blog?.content?.doc ?? null,
    tableOfContents: Array.isArray(blog?.content?.tableOfContents)
      ? blog.content.tableOfContents
      : [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function initFaqs(blog: any): Faq[] {
  return Array.isArray(blog?.faqs) ? blog.faqs : [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function initQuiz(blog: any): BlogQuiz {
  const quiz = blog?.content?.quiz;
  return {
    enabled: !!quiz?.enabled,
    questions: Array.isArray(quiz?.questions) ? quiz.questions : [],
  };
}

// Keep only fully-formed questions (text + at least two non-empty options).
function cleanQuiz(quiz: BlogQuiz): BlogQuiz {
  const questions = quiz.questions
    .map((q) => ({
      ...q,
      question: q.question?.trim() ?? "",
      options: q.options.map((o) => o?.trim() ?? ""),
    }))
    .filter(
      (q) =>
        q.question && q.options.filter((o) => o).length >= 2,
    );
  return { enabled: quiz.enabled && questions.length > 0, questions };
}

// Build a single updateBlog payload from all three tabs' state.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildBlogPayload(
  details: DetailsValues,
  content: ContentData,
  faqs: Faq[],
  quiz: BlogQuiz,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baseContent: any,
) {
  return {
    title: details.title,
    url: slugifyUrl(details.url),
    category: details.category,
    author: details.authorName,
    publishedDate: details.publishedDate
      ? new Date(details.publishedDate)
      : null,
    readTime: Number(details.readTime) || 0,
    metaTitle: details.metaTitle,
    metaDesc: details.metaDesc,
    thumbnailSrc: details.thumbnailSrc,
    thumbnailAlt: details.thumbnailAlt,
    featured: details.featured,
    recommended: details.recommended,
    placement: details.placement,
    type: details.status,
    faqs: faqs.filter((f) => f.question?.trim() && f.answer?.trim()),
    content: {
      ...(baseContent || {}),
      doc: content.doc ?? baseContent?.doc ?? null,
      tableOfContents: content.tableOfContents ?? [],
      subTitle: details.subTitle,
      tags: baseContent?.tags ?? [],
      authorDetails: {
        name: details.authorName,
        company: details.authorCompany,
        designation: details.authorDesignation,
        imgSrc: details.authorImgSrc,
        imgAlt: details.authorImgAlt,
      },
      quiz: cleanQuiz(quiz),
    },
  };
}
