import { ProjectFormData } from "@/components/Pages/Common/Projects/InternalProject/InternalProject";
import { PrivateAxios, PrivateUploadAxios } from "@/helpers/PrivateAxios";

export interface ProjectSubmission {
    id: string;
    projectName: string;
    description: string;
    problemStatement: string;
    goals: string;
    skills: string;
    tools: string;
    tag: string;
    documentUrl: string;
    mediaUrl: string;
    projectLink?: string;
}

export const getProjectUsers = async (isWithUserId: boolean) => {
    try {
        const response = await PrivateAxios.post(`/portfolio-projects/users`, { isWithUserId });
        return response.data;
    } catch (error) {
        console.error("Failed to get users by type:", error);
        throw error;
    }
};

export const postUserProject = async (requestBody: ProjectSubmission) => {
    const response = await PrivateAxios.post(`/portfolio-projects`, requestBody);
    return response.data;
};

export const deleteProject = async (id: string) => {
    const response = await PrivateAxios.delete(`portfolio-projects/${id}`);
    return response.data;
};

export const uploadProjectFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await PrivateUploadAxios.post("/upload/projects", formData);
    return response.data;
};

export const deleteProjectFile = async (key: string) => {
    const response = await PrivateAxios.delete(`upload/projects`, {
        data: { key },
    });
    return response.data;
};

export const getProjectById = async (id: string) => {
    const response = await PrivateAxios.get(`/portfolio-projects/id/${id}`);
    return response.data;
};

export const getInternalProjectById = async (id: string) => {
    const response = await PrivateAxios.get(`/projects/internal-projects/${id}`);
    return response.data;
};

export const postInternalProject = async (requestBody: any) => {
    const response = await PrivateAxios.post(`/projects/internal-projects`, requestBody);
    return response.data;
};


export const getInternalProject = async () => {
    const response = await PrivateAxios.get(`/projects/internal-projects`);
    return response.data;
};

export const deleteInternalProject = async (id: string) => {
    const response = await PrivateAxios.delete(`/projects/internal-projects/${id}`);
    return response.data;
};
