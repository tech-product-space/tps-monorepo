import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";
import { CreateFreeCoursePayload } from "@/gradient/types/freeCourse";

const FREE_COURSE_BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/free-courses`;

export const courseService = {
  /**
   * GET ALL COURSES
   */
  getAllFreeCourses: async () => {
    const response = await PrivateAxios.get(
      `${FREE_COURSE_BASE_URL}/all`
    );

    return response.data;
  },

  /**
   * GET COURSE BY ID
   */
  getFreeCourseById: async (id: string) => {
    const response = await PrivateAxios.get(
      `${FREE_COURSE_BASE_URL}/${id}`
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
      }
    );

    return response.data;
  },

  /**
   * CREATE COURSE
   */
  createFreeCourse: async (
    data: CreateFreeCoursePayload
  ) => {
    const response = await PrivateAxios.post(
      `${FREE_COURSE_BASE_URL}/create`,
      data
    );

    return response.data;
  },

  /**
   * UPDATE COURSE
   */
  updateFreeCourse: async (
    id: string,
    data: Partial<CreateFreeCoursePayload>
  ) => {
    const response = await PrivateAxios.put(
      `${FREE_COURSE_BASE_URL}/${id}`,
      data
    );

    return response.data;
  },

  /**
   * DELETE COURSE
   */
  deleteFreeCourse: async (id: string) => {
    const response = await PrivateAxios.delete(
      `${FREE_COURSE_BASE_URL}/${id}`
    );

    return response.data;
  },

  /**
   * TOGGLE COURSE STATUS
   */
  toggleStatus: async (id: string) => {
    const response = await PrivateAxios.patch(
      `${FREE_COURSE_BASE_URL}/${id}/toggle-status`
    );

    return response.data;
  },
};