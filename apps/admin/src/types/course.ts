export type CourseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED" | "draft" | "published";
export type CourseType = "online" | "offline";

export interface CourseTag {
    id: string;
    name: string;
    slug: string;
}

export interface UpdateCoursePayload {
    title?: string;
    subtitle?: string;
    description?: string;
    slug?: string;
    status?: CourseStatus;
    type?: CourseType;
    price?: number;
    is_video_course?: boolean;
    thumbnail?: string;
    thumbnail_video?: string;
    duration?: string;
    tagIds?: string[];
    content?: Record<string, any>;
    seo_meta?: {
        title?: string;
        keywords?: string[];
        description?: string;
    };
}

export interface Course {
    id: string;
    title: string;
    subtitle?: string;
    description?: string;
    slug: string;
    price: string | number;
    is_video_course: boolean;
    thumbnail?: string | null;
    thumbnail_video?: string | null;
    duration?: string | null;
    tags?: CourseTag[];
    type: CourseType;
    status: CourseStatus;
    content?: Record<string, any>;
    seo_meta?: {
        title?: string;
        keywords?: string[];
        description?: string;
    };
    createdAt: string;
    updatedAt: string;
}

import { ContentSectionData } from "@/components/Pages/Common/Free-Courses/common/ContentSection";

// Course Lessons
export type ICourseLessonStatus = "draft" | "published";

/**
 * Which editor wrote a lesson's `content`.
 *
 *  1 — the block builder: `content.blocks`
 *  2 — Tiptap: `content.doc`
 *
 * Both formats live in the same column, so every reader has to branch on this
 * rather than guess from the shape. Lessons written before the split have no
 * value stored client-side for older rows — treat a missing version as 1.
 */
export const LESSON_CONTENT_VERSION = {
    BLOCKS: 1,
    TIPTAP: 2,
} as const;

export type ILessonContentVersion =
    (typeof LESSON_CONTENT_VERSION)[keyof typeof LESSON_CONTENT_VERSION];

export interface ICourseLesson {
    id: string;
    module_id: string;
    title: string;
    slug: string;
    order: number;
    content: any;
    content_version?: ILessonContentVersion;
    // Included by `getLessonById` so the editor can key uploads by course
    // without depending on a query parameter that may not be there.
    module?: { id: string; slug: string; course_id: string };
    status: ICourseLessonStatus;
    seo_meta?: {
        title?: string;
        keywords?: string[];
        description?: string;
    };
    createdAt?: string;
    updatedAt?: string;
}
export interface CourseModule {
    id: string;
    course_id: string;
    title: string;
    slug: string;
    subtitle?: string;
    status: CourseStatus;
    overview: { sections: ContentSectionData[] };
    order: number;
    createdAt: string;
    updatedAt: string;
}

export interface CreateModulePayload {
    title: string;
    slug: string;
    subtitle?: string;
    status?: CourseStatus;
    overview?: { sections: ContentSectionData[] };
}

export interface UpdateModulePayload {
    title?: string;
    slug?: string;
    subtitle?: string;
    status?: CourseStatus;
    overview?: { sections: ContentSectionData[] };
    order?: number;
}

// One module in a bulk import. `slug` is optional — the API derives it from the
// title and de-duplicates against the course when omitted.
export interface ImportModulePayload {
    title: string;
    slug?: string;
    subtitle?: string;
    status?: CourseStatus;
    overview?: { sections: ContentSectionData[] };
}

export interface ImportModulesResponse {
    message: string;
    created: number;
    modules: CourseModule[];
}

export interface FAQ {
    id: string;
    course_id: string;
    question: string;
    answer: string;
    order: number;
    createdAt?: string;
    updatedAt?: string;
}

export interface CourseDetailResponse {
    course: Course;
    modules: CourseModule[];
    faqs: FAQ[];
}
