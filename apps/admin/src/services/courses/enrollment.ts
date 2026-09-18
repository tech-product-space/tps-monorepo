import { PrivateAxios } from "@/helpers/PrivateAxios";
import { IPaginationMeta } from "@/types/pagination";

export interface ICourseUserEnrollment {
  id: string;
  name?: string;
  phone?: string;
  createdAt: string;
  progress: number;
  totalLessons: number;
  completedLessonsCount: number;
  form_data?: Record<string, any>;
  user?: {
    name?: string;
    email?: string;
    phone?: string;
    profile_picture?: string;
  };
}

export interface ICourseEnrollmentResponse {
  success: boolean;
  data: ICourseUserEnrollment[];
  meta: IPaginationMeta;
}

export const getCourseEnrollments = async (
  courseId: string,
  page = 1,
  limit = 10,
): Promise<ICourseEnrollmentResponse> => {
  const res = await PrivateAxios.get(
    `/courses/${courseId}/enrollments?page=${page}&limit=${limit}`,
  );
  return res.data;
};
