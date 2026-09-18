import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";

import {
  CreateLessonPayload,
  FreeCourseLesson,
  ImportLessonPayload,
  UpdateLessonPayload,
} from "@/gradient/types/freeCourse";

const LESSON_BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/free-courses/lesson`;

export const lessonService = {
  /**
   * GET LESSON BY ID
   */
  getLessonById: async (id: string) => {
    const response = await PrivateAxios.get(`${LESSON_BASE_URL}/${id}`);

    return response.data as {
      success: boolean;
      data: FreeCourseLesson;
    };
  },

  /**
   * BULK IMPORT LESSONS
   *
   * The API validates the whole batch before writing, so this either creates
   * every lesson or none of them. Imported lessons arrive as drafts.
   */
  importLessons: async (moduleId: string, lessons: ImportLessonPayload[]) => {
    const response = await PrivateAxios.post(
      `${LESSON_BASE_URL}/import/${moduleId}`,
      { lessons },
    );

    return response.data as {
      success: boolean;
      message: string;
      data: FreeCourseLesson[];
    };
  },

  /**
   * CREATE LESSON
   */
  createLesson: async (moduleId: string, data: CreateLessonPayload) => {
    const response = await PrivateAxios.post(
      `${LESSON_BASE_URL}/create/${moduleId}`,
      data,
    );

    return response.data as {
      success: boolean;
      data: FreeCourseLesson;
    };
  },

  /**
   * UPDATE LESSON
   */
  updateLesson: async (id: string, data: UpdateLessonPayload) => {
    const response = await PrivateAxios.put(
      `${LESSON_BASE_URL}/update/${id}`,
      data,
    );

    return response.data as {
      success: boolean;
      data: FreeCourseLesson;
    };
  },

  /**
   * DELETE LESSON
   */
  deleteLesson: async (id: string) => {
    const response = await PrivateAxios.delete(
      `${LESSON_BASE_URL}/delete/${id}`,
    );

    return response.data as {
      success: boolean;
      message: string;
    };
  },

  /**
   * REORDER LESSONS
   */
  reorderLessons: async (moduleId: string, lessonIds: string[]) => {
    const response = await PrivateAxios.put(
      `${LESSON_BASE_URL}/reorder/${moduleId}`,
      { lessonIds },
    );

    return response.data as {
      success: boolean;
      message: string;
    };
  },

  /**
   * CHECK LESSON SLUG AVAILABILITY
   */
  checkLessonSlugAvailability: async (
    moduleId: string,
    slug: string,
    excludeId?: string,
  ) => {
    const response = await PrivateAxios.get(
      `${LESSON_BASE_URL}/check-slug/${moduleId}`,
      {
        params: {
          slug,
          excludeId,
        },
      },
    );

    return response.data as {
      success: boolean;
      slug: string;
      available: boolean;
    };
  },

  /**
   * TOGGLE LESSON STATUS
   */
  toggleLessonStatus: async (id: string) => {
    const response = await PrivateAxios.patch(
      `${LESSON_BASE_URL}/toggle-status/${id}`,
    );

    return response.data as {
      success: boolean;
      message: string;
      data: {
        id: string;
        isPublished: boolean;
      };
    };
  },
};
