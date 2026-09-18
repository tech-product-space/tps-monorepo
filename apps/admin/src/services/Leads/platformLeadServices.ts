import { PrivateAxios } from "@/helpers/PrivateAxios";

interface PlatformLeadsParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
}

export const getPlatformLeads = async ({
  page = 1,
  limit = 20,
  search = "",
  type,
}: PlatformLeadsParams = {}) => {
  const response = await PrivateAxios.get(`/leads`, {
    params: {
      page,
      limit,
      search,
      type,
    },
  });

  return response.data
}


export const downloadPlatformLeads = async (type: string, startDate?: string, endDate?: string) => {
  const response = await PrivateAxios.get('/leads/download', {
    params: { startDate, endDate, type },
  });

  return response.data;
};

// Delete a single lead by ID
export const deletePlatformLeadsById = async (id: string) => {
  try {
    const response = await PrivateAxios.delete(`/leads/${id}`);
    return response.data;
  } catch (error) {
    console.error("Failed to delete platform lead by id:", error);
    throw error;
  }
};

// Delete multiple leads by IDs array
export const deletePlatformLeadsArray = async (requestBody: string[]) => {
  try {
    const response = await PrivateAxios.delete(`/leads/bulk`, {
      data: { ids: requestBody }, // ✅ pass array inside `data`
    });
    return response.data;
  } catch (error) {
    console.error("Failed to delete platform leads array:", error);
    throw error;
  }
};

// Update Platform Lead Status
export const updatePlatformLeadsByStatus = async (
  id: string,
  status: string
) => {
  try {
    const response = await PrivateAxios.put(`/leads/${id}/status`, { status });
    return response.data;
  } catch (error) {
    console.error("Failed to update platform lead by id:", error);
    throw error;
  }
};

// Update Platform Lead Asignee
export const updatePlatformLeadsByAssignee = async (
  id: string,
  assignedTo: string
) => {
  try {
    const response = await PrivateAxios.put(`/leads/${id}/assign`, {
      assignedTo,
    });
    return response.data;
  } catch (error) {
    console.error("Failed to update platform lead assignee:", error);
    throw error;
  }
};

// Fetch Platform Leads by Assignee
export const getPlatformLeadsByAssignee = async (assigneeName: string) => {
  try {
    const response = await PrivateAxios.get(`/leads/assigned/${assigneeName}`);
    return response.data;
  } catch (error) {
    console.error("Failed to fetch platform leads by assignee:", error);
    throw error;
  }
};











