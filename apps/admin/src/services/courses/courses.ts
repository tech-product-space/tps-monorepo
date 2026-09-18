import { PrivateAxios } from "@/helpers/PrivateAxios";
import { Course, UpdateCoursePayload } from "@/types/course";

// Create course
export const createCourse = async (data: any) => {
  try {
    const res = await PrivateAxios.post("/courses", data);
    return res.data;
  } catch (error) {
    console.error("Failed to create course", error);
    throw error;
  }
};


export const checkCourseSlugAvailability = async (slug: string, excludeId = '') => {
  const response = await PrivateAxios.get(`/courses/check-slug`, {
    params: { slug, excludeId },
  });
  return response.data;
};


export const getAllCourses = async () => {
  const response = await PrivateAxios.get(`/courses/admin/all`);
  return response.data;
};


export const updateCourseStatus = async (courseId: string, status: string) => {
  const response = await PrivateAxios.put(`/courses/${courseId}/status`, {
    status,
  });

  return response.data;
};

export const getCompleteCourseDetial = async (courseId: string) => {
  const response = await PrivateAxios.get(`/courses/admin/${courseId}/full`);

  return response.data;
};

/**
 * Update course (PUT /courses/:id)
 */
export const updateCourse = async (
  id: number | string,
  updates: UpdateCoursePayload
): Promise<Course> => {
  const response = await PrivateAxios.put<Course>(
    `/courses/${id}`,
    updates
  );

  return response.data;
};
