import axios from "axios";
import { PrivateAxios } from "@/helpers/PrivateAxios";

import { IPaginationMeta } from "@/types/pagination";

export interface CohortMember {
  id: string;
  userId: number;
  course: string;
  cohort: string;
  role: string;
  status: "Active" | "Inactive";
  additional_data?: any;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  user?: {
    id: number;
    name: string;
    email: string;
    phone?: string;
    userType?: string;
  };
}

export interface CreateCohortMember {
  name: string;
  email?: string;
  phone?: string;
  course: string;
  cohort: string;
  role: string;
  status: string;
  additional_data?: any;
}

// Get all cohort members
export const getAllCohortMembers = async (params?: {
  search?: string;
  course?: string;
  cohort?: string;
  page?: number;
  limit?: number;
}) => {
  const res = await PrivateAxios.get("/cohort-members", {
    params,
  });

  return res.data as {
    success: boolean;
    data: CohortMember[];
    meta: IPaginationMeta;
  };
};
// Create cohort member
export const createCohortMember = async (payload: CreateCohortMember) => {
  try {
    const res = await PrivateAxios.post("/cohort-members", payload);
    return res.data;
  } catch (error) {
    console.error("Failed to create cohort member", error);
    throw error;
  }
};

// Create bulk cohort member from CSV file
export const bulkUploadCohortMembers = async (file: File) => {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const res = await PrivateAxios.post(
      "/cohort-members/bulk-upload",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );

    return res.data;
  } catch (error) {
    console.error("Failed to bulk upload cohort members", error);
    throw error;
  }
};


// Update cohort member
export const updateCohortMember = async (
  id: string,
  payload: Partial<CreateCohortMember>
) => {
  try {
    const res = await PrivateAxios.put(`/cohort-members/${id}`, payload);
    return res.data;
  } catch (error) {
    console.error("Failed to update cohort member", error);
    throw error;
  }
};

// Delete cohort member
export const deleteCohortMember = async (id: string) => {
  try {
    const res = await PrivateAxios.delete(`/cohort-members/${id}`);
    return res.data;
  } catch (error) {
    console.error("Failed to delete cohort member", error);
    throw error;
  }
};
