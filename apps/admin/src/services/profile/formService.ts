import { PrivateAxios } from "@/helpers/PrivateAxios";

export interface IUserProfile {
    user_id: number,
    type: string
}

export const getAllTypes = async () => {
    try {
        const response = await PrivateAxios.get("/profile/get-all-types");
        return response.data;
    } catch (error) {
        console.error("Failed to get jobs:", error);
        throw error;
    }
};

export const getUsersByType = async (type: string) => {
    try {
        const response = await PrivateAxios.get(`/profile/get-user-profile-by-type`, {
            params: { type },
        });
        return response.data;
    } catch (error) {
        console.error("Failed to get users by type:", error);
        throw error;
    }
};

export const getUserProfile = async (requestbody: IUserProfile) => {
    const response = await PrivateAxios.post(`/profile/get-user-profile`, requestbody);
    return response.data;
};

