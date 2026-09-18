import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";

const BASE_URL = `${process.env.NEXT_PUBLIC_API_URL}/leads`;

export interface LeadSubSource {
    subSource: string;
    subSourceDisplayName: string;
}

export interface LeadSource {
    source: string;
    sourceDisplayName: string;
    subSources?: LeadSubSource[];
}

export const leadService = {
    getLeads: async (params?: {
        source?: string | null;
        subSource?: string | null;
        search?: string;
        page?: number;
        limit?: number;
    }) => {
        const response = await PrivateAxios.get(BASE_URL, { params });
        return response.data;
    },

    getSources: async () => {
        const response = await PrivateAxios.get(`${BASE_URL}/sources`,);
        return response.data;
    },

    getJobApplications: async (jobId: string, params?: any) => {
        const response = await PrivateAxios.get(`${BASE_URL}/job/${jobId}`, { params });
        return response.data;
    },
    
    getExternalJobApplications: async (params?: any) => {
        const response = await PrivateAxios.get(`${BASE_URL}/job/external`, { params });
        return response.data;
    },
}