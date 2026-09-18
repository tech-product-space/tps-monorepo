import { PrivateAxios } from "@/helpers/PrivateAxios";

interface GetQuestionPayload {
  page?: number;
  limit?: number;
  search?: string;
}

export const getPublishedInterviewQuestions = async (
  data: GetQuestionPayload
) => {
  const response = await PrivateAxios.get("interview/published-questions", {
    params: data,
  });
  return response.data;
};

export const getUnPublishedInterviewQuestions = async (
  data: GetQuestionPayload
) => {
  const response = await PrivateAxios.get("interview/unpublished-questions", {
    params: data,
  });
  return response.data;
};

export const getInterviewQuestionById = async (id: string) => {
  const response = await PrivateAxios.get(`interview/questions/admin/${id}`);
  return response.data;
};

export interface CreateInterviewQuestionPayload {
  title: string;
  company?: string;
  role?: string[];
  type?: string[];
  phone?: string;
  isPublished?: boolean;
  slug?: string;
  metaTitle?: string;
  metaDesc?: string;
  answerContent?: string;
  userName?: string;
}

export const createInterviewQuestion = async (
  payload: CreateInterviewQuestionPayload
) => {
  const response = await PrivateAxios.post("interview/questions/admin", payload);
  return response.data;
};

export interface UpdateInterviewQuestionPayload {
  title?: string;
  company?: string;
  role?: string[];
  type?: string[];
  phone?: string;
  isPublished?: boolean;
}

export const updateInterviewQuestion = async (
  id: string,
  payload: UpdateInterviewQuestionPayload
) => {
  const response = await PrivateAxios.put(
    `interview/questions/${id}/admin`,
    payload
  );
  return response.data;
};

export const addAnswerAdmin = async ({
  questionId,
  content,
  userName,
}: {
  questionId: string;
  content: string;
  userName?: string;
}) => {
  const response = await PrivateAxios.post(
    `interview/questions/${questionId}/answers/admin`,
    { content, userName }
  );
  return response.data;
};

export const setPublishStatus = async (id: string, isPublished: boolean) => {
  const response = await PrivateAxios.put(`interview/questions/${id}/publish`, {
    isPublished,
  });
  return response.data;
};

export const editFeedbackAdmin = async (
  questionId: string,
  answerId: string,
  feedbackId: string,
  feedbackText: string
) => {
  const response = await PrivateAxios.put(
    `interview/questions/${questionId}/answers/${answerId}/feedback/${feedbackId}/admin`,
    { feedbackText }
  );
  return response.data;
};

export const deleteFeedbackAdmin = async (
  questionId: string,
  answerId: string,
  feedbackId: string
) => {
  const response = await PrivateAxios.delete(
    `interview/questions/${questionId}/answers/${answerId}/feedback/${feedbackId}/admin`
  );
  return response.data;
};

export const editAnswerAdmin = async ({
  questionId,
  answerId,
  content,
}: {
  questionId: string;
  answerId: string;
  content: string;
}) => {
  const response = await PrivateAxios.put(
    `interview/questions/${questionId}/answers/${answerId}/admin`,
    {
      content,
    }
  );
  return response.data;
};

export const deleteAnswerAdmin = async ({
  questionId,
  answerId,
}: {
  questionId: string;
  answerId: string;
}) => {
  const response = await PrivateAxios.delete(
    `interview/questions/${questionId}/answers/${answerId}/admin`
  );
  return response.data;
};

export const checkSlugAvailability = async (
  slug: string,
  excludeId?: string
) => {
  const params = new URLSearchParams({ slug });

  if (excludeId) {
    params.append("excludeId", excludeId);
  }

  const response = await PrivateAxios.get(
    `/interview/question/slug-availability?${params.toString()}`
  );

  return response.data;
};

interface InerfaceSeoData {
  slug: string;
  metaTitle: string;
  metaDesc: string;
}

export const updateInterviewQuestionMetaData = async (
  id: string,
  seoData: InerfaceSeoData
) => {
  const response = await PrivateAxios.put(
    `/interview/question/${id}/update-slug`,
    seoData 
  );

  return response.data;
};
