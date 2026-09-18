import { PrivateAxios } from "@/helpers/PrivateAxios";
import { CourseTag } from "@/types/course";

// GET /course-tags
export const getCourseTags = async (): Promise<CourseTag[]> => {
  const response = await PrivateAxios.get("/course-tags");
  return response.data;
};

// POST /course-tags
export const createCourseTag = async (name: string): Promise<CourseTag> => {
  const response = await PrivateAxios.post("/course-tags", { name });
  return response.data;
};

// PUT /course-tags/:id
export const updateCourseTag = async (
  id: string,
  name: string,
): Promise<CourseTag> => {
  const response = await PrivateAxios.put(`/course-tags/${id}`, { name });
  return response.data;
};

// DELETE /course-tags/:id
export const deleteCourseTag = async (id: string) => {
  const response = await PrivateAxios.delete(`/course-tags/${id}`);
  return response.data;
};
