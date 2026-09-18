import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";
import { CreateJobPayload } from "../types/job";

export const jobService = {
  getAllJobs: async (params?: any) => {
    const res = await PrivateAxios.get("jobs/admin/jobs", { params });
    return res.data;
  },

  getAllInternalJobs: async (params?: any) => {
    const res = await PrivateAxios.get("jobs/admin/internal-jobs", { params });
    return res.data;
  },

  deleteJob: async (id: string) => {
    const res = await PrivateAxios.delete(`jobs/admin/jobs/${id}`);
    return res.data;
  },

  getJobById: async (id: string) => {
    const res = await PrivateAxios.get(`jobs/${id}`);
    return res.data;
  },

  updateJob: async (id: string, payload: CreateJobPayload) => {
    const res = await PrivateAxios.put(`jobs/admin/jobs/${id}`, payload);
    return res.data;
  },

  createJob: async (payload: CreateJobPayload) => {
    const res = await PrivateAxios.post("jobs/admin/create", payload);
    return res.data;
  },
};
