import { PrivateAxios } from "@/helpers/PrivateAxios";
import { QuizQuestion, CreateQuizQuestionPayload, UpdateQuizQuestionPayload } from "@/types/quiz";

// Get all quiz questions
export const getAllQuizQuestions = async (): Promise<QuizQuestion[]> => {
    try {
        const response = await PrivateAxios.get("/quiz");
        return response.data;
    } catch (error) {
        console.error("❌ Failed to fetch quiz questions:", error);
        throw error;
    }
};

// Create a new quiz question
export const createQuizQuestion = async (
    data: CreateQuizQuestionPayload
): Promise<QuizQuestion> => {
    try {
        const response = await PrivateAxios.post("/quiz", data);
        return response.data;
    } catch (error) {
        console.error("❌ Failed to create quiz question:", error);
        throw error;
    }
};

// Update an existing quiz question
export const updateQuizQuestion = async (
    id: number,
    data: UpdateQuizQuestionPayload
): Promise<QuizQuestion> => {
    try {
        const response = await PrivateAxios.put(`/quiz/${id}`, data);
        return response.data;
    } catch (error) {
        console.error("❌ Failed to update quiz question:", error);
        throw error;
    }
};

// Delete a quiz question
export const deleteQuizQuestion = async (id: number): Promise<{ message: string }> => {
    try {
        const response = await PrivateAxios.delete(`/quiz/${id}`);
        return response.data;
    } catch (error) {
        console.error("❌ Failed to delete quiz question:", error);
        throw error;
    }
};
