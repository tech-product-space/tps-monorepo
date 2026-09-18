import { PrivateAxios } from "@/helpers/PrivateAxios";

export interface FAQ {
    id: string;
    course_id: string;
    question: string;
    answer: string;
    order: number;
    createdAt?: string;
    updatedAt?: string;
}

export const getFAQs = async (courseId: string): Promise<FAQ[]> => {
    const response = await PrivateAxios.get(`/courses/faqs/${courseId}`);
    return response.data;
};

export const createFAQ = async (courseId: string, data: { question: string; answer: string }): Promise<FAQ> => {
    const response = await PrivateAxios.post(`/courses/faqs/${courseId}`, data);
    return response.data;
};

export const updateFAQ = async (id: string, data: Partial<FAQ>): Promise<FAQ> => {
    const response = await PrivateAxios.put(`/courses/faqs/${id}`, data);
    return response.data;
};

export const deleteFAQ = async (id: string): Promise<{ message: string }> => {
    const response = await PrivateAxios.delete(`/courses/faqs/${id}`);
    return response.data;
};

export const reorderFAQs = async (courseId: string, faqIds: string[]): Promise<{ message: string }> => {
    const response = await PrivateAxios.put(`/courses/faqs/${courseId}/reorder`, { faqIds });
    return response.data;
};
