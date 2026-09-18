import { PrivateAxios } from "@/helpers/PrivateAxios";
import { IPaginationMeta } from "@/types/pagination";

interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  profile_picture: string | null;
}

interface Event {
  id: number;
  eventTitle: string;
  eventType: string;
  eventStartDate: string;
  eventEndDate: string;
}

interface TeamMemberGuest {
  id: number;
  userId: number;
  name: string;
  phone: string;
  certificateApproved: boolean;
  certificateGenerated: boolean;
  certificateGeneratedAt: string | null;
  certificateId: string | null;
}

interface TeamMember {
  user: User;
  guest: TeamMemberGuest;
}

export interface IEventFeedback {
  id: number;
  name: string;
  phone: string;
  feedbackData: Record<string, string>;
  feedbackSubmittedAt: string;
  certificateGenerated: boolean;
  certificateGeneratedAt?: string;
  certificateId?: string;
  certificateApproved: boolean;
  user: User;
  event: Event;
  teamMembers?: TeamMember[]; 
}

interface EventFeedbackResponse {
  meta: IPaginationMeta;
  data: IEventFeedback[];
}
export const getEventFeedbacks = async (
  eventId: number,
  page = 1,
  limit = 10,
): Promise<EventFeedbackResponse> => {
  const response = await PrivateAxios.get(
    `/events/feedback/${eventId}?page=${page}&limit=${limit}`,
  );
  return response.data;
};

export const exportEventFeedbacks = async (
  eventId: string,
): Promise<{ data: IEventFeedback[] }> => {
  const response = await PrivateAxios.get(`/events/feedback/${eventId}/export`);
  return response.data;
};
