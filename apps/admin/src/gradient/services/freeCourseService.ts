import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";
import { CreateFreeCoursePayload, CreateModulePayload, FreeCourseModule, UpdateModulePayload } from "@/gradient/types/freeCourse";

const FREE_COURSE_BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/free-courses`;
const MODULE_BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/free-courses/module`;


export const freeCourseService = {
  /**
   * GET ALL COURSES
   */
  getAllFreeCourses: async () => {
    const response = await PrivateAxios.get(
      `${FREE_COURSE_BASE_URL}/all`,
    );
    return response.data;
  },

  /**
   * GET COURSE BY ID
   */
  getFreeCourseById: async (id: string) => {
    const response = await PrivateAxios.get(
      `${FREE_COURSE_BASE_URL}/${id}`,
    );
    return response.data;
  },

  /**
   * MINT A PREVIEW LINK TOKEN
   *
   * Single-use and minutes-long. Exchanged by the public site for a session
   * cookie, which is what actually lifts the publish filters — see
   * `../FREE_COURSE_PREVIEW_PLAN.md` §3. Mint one per click rather than
   * caching: a token held in component state goes stale in fifteen minutes and
   * fails on the one click that matters.
   */
  createPreviewToken: async (courseId: string) => {
    const response = await PrivateAxios.post(
      `${FREE_COURSE_BASE_URL}/${courseId}/preview-token`,
    );
    return response.data;
  },

  /**
   * BULK PUBLISH / UNPUBLISH THE CURRICULUM
   *
   * One request for the whole batch. The ids are filtered against `courseId`
   * server-side, and the response reports what actually changed rather than
   * echoing what was asked for.
   */
  bulkPublishCurriculum: async (
    courseId: string,
    payload: {
      isPublished: boolean;
      moduleIds?: string[];
      lessonIds?: string[];
      includeCourse?: boolean;
    },
  ) => {
    const response = await PrivateAxios.patch(
      `${FREE_COURSE_BASE_URL}/${courseId}/curriculum/publish`,
      payload,
    );
    return response.data;
  },

  /**
   * CHECK SLUG AVAILABILITY
   */
  checkSlugAvailability: async (slug: string) => {
    const response = await PrivateAxios.get(
      `${FREE_COURSE_BASE_URL}/check-slug`,
      {
        params: { slug },
      },
    );
    return response.data;
  },

  /**
   * CREATE COURSE
   */
  createFreeCourse: async (data: CreateFreeCoursePayload) => {
    const response = await PrivateAxios.post(
      `${FREE_COURSE_BASE_URL}/create`,
      data,
    );
    return response.data;
  },

  /**
   * UPDATE COURSE
   */
  updateFreeCourse: async (
    id: string,
    data: Partial<CreateFreeCoursePayload>,
  ) => {
    const response = await PrivateAxios.put(
      `${FREE_COURSE_BASE_URL}/${id}`,
      data,
    );
    return response.data;
  },

  /**
   * DELETE COURSE
   */
  deleteFreeCourse: async (id: string) => {
    const response = await PrivateAxios.delete(
      `${FREE_COURSE_BASE_URL}/${id}`,
    );
    return response.data;
  },

  /**
   * TOGGLE PUBLISH STATUS
   */
  toggleStatus: async (id: string) => {
    const response = await PrivateAxios.patch(
      `${FREE_COURSE_BASE_URL}/${id}/toggle-status`,
    );
    return response.data;
  },





  // SERVICE FILES FOR THE MODULES & LESSONS 

    /**
   * GET ALL MODULES BY COURSE
   */
  getModulesByCourse: async (courseId: string) => {
    const response = await PrivateAxios.get(
      `${MODULE_BASE_URL}/all/${courseId}`
    );
    return response.data as {
      success: boolean;
      data: FreeCourseModule[];
    };
  },

  /**
   * CREATE MODULE
   */
  createModule: async (
    courseId: string,
    data: CreateModulePayload
  ) => {
    const response = await PrivateAxios.post(
      `${MODULE_BASE_URL}/create/${courseId}`,
      data
    );
    return response.data as {
      success: boolean;
      data: FreeCourseModule;
    };
  },

  /**
   * UPDATE MODULE
   */
  updateModule: async (
    id: string,
    data: UpdateModulePayload
  ) => {
    const response = await PrivateAxios.put(
      `${MODULE_BASE_URL}/update/${id}`,
      data
    );
    return response.data as {
      success: boolean;
      data: FreeCourseModule;
    };
  },

  /**
   * DELETE MODULE
   */
  deleteModule: async (id: string) => {
    const response = await PrivateAxios.delete(
      `${MODULE_BASE_URL}/delete/${id}`
    );
    return response.data as {
      success: boolean;
      message: string;
    };
  },

  /**
   * REORDER MODULES
   */
  reorderModules: async (courseId: string, moduleIds: string[]) => {
    const response = await PrivateAxios.put(
      `${MODULE_BASE_URL}/reorder/${courseId}`,
      { moduleIds }
    );
    return response.data as {
      success: boolean;
      message: string;
    };
  },

  /**
   * CHECK SLUG AVAILABILITY
   */
  checkModuleSlugAvailability: async (
    courseId: string,
    slug: string,
    excludeId?: string
  ) => {
    const response = await PrivateAxios.get(
      `${MODULE_BASE_URL}/check-slug/${courseId}`,
      {
        params: { slug, excludeId },
      }
    );
    return response.data as {
      success: boolean;
      slug: string;
      available: boolean;
    };
  },

  /**
   * TOGGLE MODULE STATUS
   */
  toggleModuleStatus: async (id: string) => {
    const response = await PrivateAxios.patch(
      `${MODULE_BASE_URL}/toggle-status/${id}`
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
