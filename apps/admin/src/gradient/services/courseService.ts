import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";
import { cleanHtml } from "@/gradient/lib/cleanHtml";
import {
  Course,
  CourseBrochure,
  CourseEmailTemplatesResponse,
  CourseEmailType,
  CourseLeadsResponse,
  CoursePricing,
  CourseSettings,
} from "@/gradient/types/course";

const COURSE_BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/courses`;

export interface UpdateCoursePayload {
  name?: string;
  isPublished?: boolean;
  /** Merged server-side, so a partial block cannot wipe untouched fields. */
  pricing?: Partial<CoursePricing>;
  settings?: Partial<CourseSettings>;
  brochure?: CourseBrochure;
}

export const courseService = {
  getAllCourses: async (): Promise<{ success: boolean; data: Course[] }> => {
    const response = await PrivateAxios.get(`${COURSE_BASE_URL}/admin/courses`);
    return response.data;
  },

  createCourse: async (data: { name: string; slug: string }) => {
    const response = await PrivateAxios.post(
      `${COURSE_BASE_URL}/admin/create`,
      data,
    );
    return response.data;
  },

  getCourseById: async (
    id: string,
  ): Promise<{ success: boolean; data: Course }> => {
    const response = await PrivateAxios.get(
      `${COURSE_BASE_URL}/admin/courses/${id}`,
    );
    return response.data;
  },

  updateCourse: async (id: string, data: UpdateCoursePayload) => {
    const response = await PrivateAxios.put(
      `${COURSE_BASE_URL}/admin/courses/${id}`,
      data,
    );
    return response.data;
  },

  toggleCourseStatus: async (id: string) => {
    const response = await PrivateAxios.patch(
      `${COURSE_BASE_URL}/admin/courses/${id}/toggle-status`,
    );
    return response.data;
  },

  deleteCourse: async (id: string) => {
    const response = await PrivateAxios.delete(
      `${COURSE_BASE_URL}/admin/courses/${id}`,
    );
    return response.data;
  },

  saveBrochure: async (
    id: string,
    brochure: { fileKey: string; fileName: string },
  ) => {
    const response = await PrivateAxios.put(
      `${COURSE_BASE_URL}/admin/courses/${id}/brochure`,
      brochure,
    );
    return response.data;
  },

  removeBrochure: async (id: string) => {
    const response = await PrivateAxios.delete(
      `${COURSE_BASE_URL}/admin/courses/${id}/brochure`,
    );
    return response.data;
  },

  getEmailTemplates: async (
    id: string,
  ): Promise<CourseEmailTemplatesResponse> => {
    const response = await PrivateAxios.get(
      `${COURSE_BASE_URL}/admin/courses/${id}/templates`,
    );
    return response.data;
  },

  saveEmailTemplate: async (
    id: string,
    type: CourseEmailType,
    template: { subject: string; body: string; isEnabled: boolean },
  ) => {
    const response = await PrivateAxios.put(
      `${COURSE_BASE_URL}/admin/courses/${id}/templates/${type}`,
      {
        subject: template.subject,
        // Same sanitising the resource templates get before they are stored.
        body: cleanHtml(template.body),
        isEnabled: template.isEnabled,
      },
    );
    return response.data;
  },

  sendTestEmail: async (id: string, type: CourseEmailType, to: string) => {
    const response = await PrivateAxios.post(
      `${COURSE_BASE_URL}/admin/courses/${id}/templates/${type}/test-send`,
      { to },
    );
    return response.data;
  },

  getCourseLeads: async (
    id: string,
    params: { page?: number; limit?: number; subSource?: string; search?: string },
  ): Promise<CourseLeadsResponse> => {
    const response = await PrivateAxios.get(
      `${COURSE_BASE_URL}/admin/courses/${id}/leads`,
      { params },
    );
    return response.data;
  },
};
