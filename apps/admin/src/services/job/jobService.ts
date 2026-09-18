import { PrivateAxios } from "@/helpers/PrivateAxios";

interface GetJobsPayload {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    jobSource?: string;
}

export const getJobs = async (data: GetJobsPayload) => {
    try {
        const response = await PrivateAxios.get("/jobs", {params: data});
        return response.data;
    } catch (error) {
        console.error("Failed to get jobs:", error);
        throw error;
    }
};
export const getJobsUploadedByAdmin = async (data: GetJobsPayload) => {
    try {
        const response = await PrivateAxios.get("/job-applications/jobs-with-applications", {params: data});
        return response.data;
    } catch (error) {
        console.error("Failed to get jobs:", error);
        throw error;
    }
};

export const getApplicationsByJobId = async (
  jobId: string,
  payload: GetJobsPayload = {}
) => {
  try {
    const response = await PrivateAxios.get(
      `/job-applications/job/${jobId}/applications`,
      {
        params: payload,
      }
    );

    return {
      data: response.data.data,
      meta: response.data.meta
    };
  } catch (error) {
    console.error("Failed to fetch applications by jobId:", error);
    throw error;
  }
};

export const getJobById = async (id: string) => {
    try {
        const response = await PrivateAxios.get(`/jobs/${id}`);
        return response.data;
    } catch (error) {
        console.error("Failed to get job by id:", error);
        throw error;
    }
};

export const updateJob = async (id: string, values: any) => {
    try {
        const response = await PrivateAxios.put(`/jobs/${id}/update`, values);
        return response.data;
    } catch (error) {
        console.error("Failed to update job description:", error);
        throw error;
    }
};

export const createJob = async (values: any) => {
    try {
        const response = await PrivateAxios.post(`/jobs/create`, values);
        return response.data;
    } catch (error) {
        console.error("Failed to creating job description:", error);
        throw error;
    }
};

export const setJobStatus = async (id: string, status: string) => {
    try {
        const response = await PrivateAxios.patch(`/jobs/${id}/status`, { status });
        return response.data;
    } catch (error) {
        console.error("Failed to update job status:", error);
        throw error;
    }
};

export const repostJob = async (id: string) => {
    try {
        const response = await PrivateAxios.post(`/jobs/${id}/repost`);
        return response.data;
    } catch (error) {
        console.error("Failed to repost job:", error);
        throw error;
    }
};

export const deleteJob = async (id: string) => {
    try {
        const response = await PrivateAxios.delete(`/jobs/${id}`);
        return response.data;
    } catch (error) {
        console.error("Failed to update job description:", error);
        throw error;
    }
};
