import { PrivateAxios } from "@/helpers/PrivateAxios";

interface GetVisitorPayload {
  page: number; 
  limit: number;
  search?: string;
  readStatus?: string;
  pageUrl?: string;
  ignorePatterns?: string;
}

export interface ExportVisitorNotificationPayload {
  search?: string;
  readStatus?: "all" | "read" | "unread";
  pageUrl?: string;
  ignorePatterns?: string;
  dateFrom?: string;
  dateTo?: string;
}


export const getVisitors = async ({
  page = 1,
  limit = 20,
  search,
  readStatus,
  pageUrl,
  ignorePatterns,
}: GetVisitorPayload) => {
  const response = await PrivateAxios.get("/visitor/notifications", {
    params: {
      page,
      limit,
      search,
      readStatus,
      pageUrl,
      ignorePatterns,
    },
  });

  return response;
};

export const exportVisitorNotification = async ({
  search,
  readStatus,
  pageUrl,
  ignorePatterns,
  dateTo,
  dateFrom,
}: ExportVisitorNotificationPayload) => {
  const response = await PrivateAxios.get("/visitor/notifications/export", {
    params: {
      search,
      readStatus,
      pageUrl,
      ignorePatterns,
      dateTo,
      dateFrom
    },
  });

  return response;
};


export const getVisitorDetails = async (visitorId: string) => {
  const response = await PrivateAxios.get(`/visitor/${visitorId}`);
  return response.data;
};

export const blockedUsers = async (page = 1, limit = 20) => {
  const response = await PrivateAxios.get(`/visitor/blocked?page=${page}&limit=${limit}`);
  return response;
};

export const getVisitorContacts = async (visitorId: string) => {
  const response = await PrivateAxios.get(`/visitor/contacts/${visitorId}`);
  return response.data;
};


// Block a visitor
export const blockVisitor = async (visitorId: string, blockingReason: string) => {
  const response = await PrivateAxios.post(
    `/visitor/block/${visitorId}`,
    { blockingReason }
  );
  return response.data;
};

// Unblock a visitor
export const unblockVisitor = async (visitorId: string) => {
  const response = await PrivateAxios.post(
    `/visitor/unblock/${visitorId}`
  );
  return response.data;
};

export const markVisitorAsRead = async (data: { notificationId: number }) => {
  const response = await PrivateAxios.post(
    `/visitor/notification/mark-read`,
    data
  );
  return response.data;
};

export const getUnreadNotificationCount = async (): Promise<{success: boolean, unreadCount: number}> => {
  const response = await PrivateAxios.get(`/visitor/notifications/unread-count`);
  return response.data;
};