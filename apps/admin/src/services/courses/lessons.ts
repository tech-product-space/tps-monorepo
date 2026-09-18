import { PrivateAxios } from "@/helpers/PrivateAxios";
import type {
    ICourseLesson,
    ICourseLessonStatus,
    ILessonContentVersion,
} from "@/types/course";

// One lesson in a bulk import. `slug` is optional — the API derives it from the
// title and de-duplicates against the module when omitted.
//
// `content` is checked against `content_version` server-side, so the two always
// travel together: `{ blocks: [] }` with version 1, `{ doc }` with version 2.
// Omitting the version means 1 — the API assumes an older client.
export type IImportLessonPayload = {
    title: string;
    slug?: string;
    status?: ICourseLessonStatus;
    content?: { blocks: unknown[] } | { doc: object | null };
    content_version?: ILessonContentVersion;
    seo_meta?: { title?: string; keywords?: string[]; description?: string; };
};

export type IImportLessonsResponse = {
    message: string;
    created: number;
    lessons: ICourseLesson[];
};

export type ICreateLessonPayload = {
    title: string;
    slug: string;
    status: ICourseLessonStatus;
    content_version?: ILessonContentVersion;
};

export type IUpdateLessonPayload = {
    title?: string;
    slug?: string;
    status?: ICourseLessonStatus;
    content?: any;
    // Sent alongside `content` when converting a lesson from blocks to Tiptap;
    // the API validates the two against each other in the same request.
    content_version?: ILessonContentVersion;
    seo_meta?: {
        title?: string;
        keywords?: string[];
        description?: string;
    };
};

/**
 * Bulk-create lessons in a module. The API validates the whole batch before
 * writing, so this either creates every lesson or none of them.
 */
export async function importLessons(
    moduleId: string,
    lessons: IImportLessonPayload[],
): Promise<IImportLessonsResponse> {
    const response = await PrivateAxios.post(
        `/courses/modules/${moduleId}/lessons/import`,
        { lessons },
    );
    return response.data;
}

export async function createLesson(moduleId: string, payload: ICreateLessonPayload): Promise<ICourseLesson[]> {
    const response = await PrivateAxios.post(`/courses/modules/${moduleId}/lessons`, payload);
    return response.data;
}

export async function updateLesson(lessonId: string, payload: IUpdateLessonPayload): Promise<ICourseLesson[]> {
    const response = await PrivateAxios.put(`/courses/modules/lessons/${lessonId}`, payload);
    return response.data;
}

export const getLessonsByModuleId = async (moduleId: string): Promise<ICourseLesson[]> => {
    const response = await PrivateAxios.get<ICourseLesson[]>(`/courses/modules/${moduleId}/lessons`);
    return response.data;
};

export const getLessonById = async (lessonId: string): Promise<ICourseLesson> => {
    const response = await PrivateAxios.get<ICourseLesson>(`/courses/modules/lessons/${lessonId}`);
    return response.data;
};

export const deleteLesson = async (lessonId: string): Promise<{ message: string }> => {
    const response = await PrivateAxios.delete<{ message: string }>(`/courses/modules/lessons/${lessonId}`);
    return response.data;
};

export const reorderLessons = async (moduleId: string, lessonIds: string[]): Promise<{ message: string }> => {
    const response = await PrivateAxios.put<{ message: string }>(`/courses/modules/${moduleId}/lessons/reorder`, { lessonIds });
    return response.data;
};

export const checkLessonSlugAvailability = async (moduleId: string, slug: string, excludeId = '') => {
    const response = await PrivateAxios.get(`/courses/modules/${moduleId}/lessons/check-slug`, {
        params: { slug, excludeId },
    });
    return response.data;
};

export const updateLessonStatus = async (lessonId: string, status: ICourseLessonStatus) => {
    const response = await PrivateAxios.put(`/courses/modules/lessons/${lessonId}/status`, {
        status,
    });
    return response.data;
};

export type IBulkLessonStatusResponse = {
    message: string;
    // Lessons whose status actually changed; already-matching ones aren't counted.
    updated: number;
    status: ICourseLessonStatus;
};

/** Sets every lesson in a module to one status, in a single request. */
export const updateAllLessonStatus = async (
    moduleId: string,
    status: ICourseLessonStatus,
): Promise<IBulkLessonStatusResponse> => {
    const response = await PrivateAxios.put(
        `/courses/modules/${moduleId}/lessons/status`,
        { status },
    );
    return response.data;
};

/**
 * MINT A LESSON PREVIEW LINK TOKEN
 *
 * Single-use and minutes long. Exchanged by the public site for an httpOnly
 * session cookie, which is what actually lifts the published filters on the
 * lesson and its module — see `lib/preview.ts`. Mint one per click rather than
 * caching: a token held in component state goes stale in fifteen minutes and
 * fails on the one click that matters.
 *
 * The slugs come back from the API rather than from the editor's own copy: they
 * differ for exactly as long as it takes somebody to rename something and save,
 * and the public site refuses a link whose path and token disagree.
 */
export const createLessonPreviewToken = async (
    lessonId: string,
): Promise<{
    success: boolean;
    data: {
        token: string;
        slug: string;
        moduleSlug: string;
        courseSlug: string;
    };
}> => {
    const response = await PrivateAxios.post(
        `/courses/admin/lessons/${lessonId}/preview-token`,
    );
    return response.data;
};
