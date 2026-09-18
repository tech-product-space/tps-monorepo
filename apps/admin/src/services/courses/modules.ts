import { PrivateAxios } from "@/helpers/PrivateAxios";
import type {
    CourseModule,
    CreateModulePayload,
    UpdateModulePayload,
    ImportModulePayload,
    ImportModulesResponse,
} from "@/types/course";

/**
 * Get modules by course ID
 */
export const getModulesByCourseId = async (courseId: string): Promise<CourseModule[]> => {
    const response = await PrivateAxios.get<CourseModule[]>(`/courses/modules/${courseId}`);
    return response.data;
};

/**
 * Get module by ID
 */
export const getModuleById = async (moduleId: string): Promise<CourseModule> => {
    const response = await PrivateAxios.get<CourseModule>(`/courses/modules/detail/${moduleId}`);
    return response.data;
};

/**
 * Create a new module
 */
export const createModule = async (courseId: string, payload: CreateModulePayload): Promise<CourseModule> => {
    const response = await PrivateAxios.post<CourseModule>(`/courses/modules/${courseId}`, payload);
    return response.data;
};

/**
 * Bulk-create modules on a course. The API validates the whole batch before
 * writing, so this either creates every module or none of them.
 */
export const importModules = async (
    courseId: string,
    modules: ImportModulePayload[],
): Promise<ImportModulesResponse> => {
    const response = await PrivateAxios.post<ImportModulesResponse>(
        `/courses/modules/${courseId}/import`,
        { modules },
    );
    return response.data;
};

/**
 * Update a module
 */
export const updateModule = async (moduleId: string, payload: UpdateModulePayload): Promise<CourseModule> => {
    const response = await PrivateAxios.put<CourseModule>(`/courses/modules/${moduleId}`, payload);
    return response.data;
};

/**
 * Delete a module
 */
export const deleteModule = async (moduleId: string): Promise<{ message: string }> => {
    const response = await PrivateAxios.delete<{ message: string }>(`/courses/modules/${moduleId}`);
    return response.data;
};

/**
 * Reorder modules
 */
export const reorderModules = async (courseId: string, moduleIds: string[]): Promise<{ message: string }> => {
    const response = await PrivateAxios.put<{ message: string }>(`/courses/modules/${courseId}/reorder`, { moduleIds });
    return response.data;
};

/**
 * Check module slug availability
 */
export const checkModuleSlugAvailability = async (courseId: string, slug: string, excludeId = '') => {
    const response = await PrivateAxios.get(`/courses/modules/${courseId}/check-slug`, {
        params: { slug, excludeId },
    });
    return response.data;
};

/**
 * Update module status
 */
export const updateModuleStatus = async (moduleId: string, status: string) => {
    const response = await PrivateAxios.put(`/courses/modules/${moduleId}/status`, {
        status,
    });
    return response.data;
};
