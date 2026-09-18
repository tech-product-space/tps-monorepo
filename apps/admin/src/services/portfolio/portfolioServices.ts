import { PrivateAxios } from "@/helpers/PrivateAxios";

// ✅ Simplified ActiveUser interface (matches your current backend response)
export interface ActiveUser {
  userId: number;
  name: string;
  email: string;
  phone?: string | null;
  profile_picture: string | null;
  WorkExperience: boolean;
  PortfolioProject: boolean;
  PersonalInfo: boolean;
  Education: boolean;
  Achievement: boolean;
  isPublished: boolean;
}

// ✅ Response structure for "get all" endpoint
export interface ActiveUserListResponse {
  data: ActiveUser[];
  total: number;
}

// ✅ Response structure for "get by id" endpoint
export interface ActiveUserResponse {
  data: ActiveUser;
}

// ✅ Fetch all portfolio users (no pagination)
export const getPortfolioUsers = async (): Promise<ActiveUserListResponse> => {
  try {
    const response = await PrivateAxios.get(`/api/active-users/portfolio`);
    return response.data as ActiveUserListResponse;
  } catch (error) {
    console.error("Failed to get portfolio users:", error);
    throw error;
  }
};


export const toggleUserPublishStatus = async (userId: number) => {
  try {
    const response = await PrivateAxios.patch(`/api/active-users/portfolio/${userId}`);
    return response.data;
  } catch (error) {
    console.error("Error toggling publish status:", error);
    throw error;
  }
};