import { PrivateAxios } from "@/helpers/PrivateAxios";

export interface NewCohortMember {
  name: string;
  email?: string;
  phone?: string;
  type: string;
}

export const getAllReferees = async () => {
  try {
    const response = await PrivateAxios.get("/referrals/all");
    return response.data;
  } catch (error) {
    console.error("Failed to get jobs:", error);
    throw error;
  }
};

export const getAllReferrals = async () => {
  try {
    const response = await PrivateAxios.get("/members/all");
    return response.data;
  } catch (error) {
    console.error("Failed to get jobs:", error);
    throw error;
  }
};

export const getReferralsById = async (id: string) => {
  try {
    const response = await PrivateAxios.get(`/referrals/${id}/members`);
    return response.data;
  } catch (error) {
    console.error("Failed to get jobs:", error);
    throw error;
  }
};

export const addCohortMember = async (requestBody: NewCohortMember) => {
  try {
    const response = await PrivateAxios.post(`/referrals/add`, requestBody);
    return response.data;
  } catch (error) {
    console.error("Failed to add cohort member:", error);
    throw error;
  }
};

export const updateCohortMember = async (
  id: string,
  requestBody: NewCohortMember
) => {
  try {
    const response = await PrivateAxios.put(`/referrals/${id}`, requestBody);
    return response.data;
  } catch (error) {
    console.error("Failed to update cohort member:", error);
    throw error;
  }
};

export const deleteCohortMember = async (id: string) => {
  try {
    const response = await PrivateAxios.delete(`/referrals/${id}`);
    return response.data;
  } catch (error) {
    console.error("Failed to delete cohort member:", error);
    throw error;
  }
};
