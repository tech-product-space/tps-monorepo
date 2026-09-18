import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";

import {
  CreateModulePayload,
  FreeCourseModule,
  ImportModulePayload,
  UpdateModulePayload,
} from "@/gradient/types/freeCourse";

const MODULE_BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/free-courses/module`;

export const moduleService = {
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
   * BULK IMPORT MODULES
   *
   * The API validates the whole batch before writing, so this either creates
   * every module or none of them. Imported modules arrive as drafts.
   */
  importModules: async (courseId: string, modules: ImportModulePayload[]) => {
    const response = await PrivateAxios.post(
      `${MODULE_BASE_URL}/import/${courseId}`,
      { modules }
    );

    return response.data as {
      success: boolean;
      message: string;
      data: FreeCourseModule[];
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
  reorderModules: async (
    courseId: string,
    moduleIds: string[]
  ) => {
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
   * CHECK MODULE SLUG AVAILABILITY
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