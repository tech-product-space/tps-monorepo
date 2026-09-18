import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";

const BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/subscribers`;

export const subscriberService = {
  getSubscribers: async (params?: {
    status?: string | null;
    source?: string | null;
    search?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await PrivateAxios.get(BASE_URL, { params });
    return response.data;
  },
};
