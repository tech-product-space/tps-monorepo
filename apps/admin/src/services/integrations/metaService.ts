import { PrivateAxios } from "@/helpers/PrivateAxios";
import { IMetaIntegrationListItem } from "@/types/integrations/meta";

export const metaService = {

    connect: async (returnPath: string) => {
        const res = await PrivateAxios.get(
            `/integrations/meta/connect?returnPath=${encodeURIComponent(returnPath)}`
        );

        return res.data;

    },

    list: async (): Promise<IMetaIntegrationListItem[]> => {
        const res = await PrivateAxios.get("/integrations/meta");
        return res.data;
    },

    delete: async (id: string) => {
        const res = await PrivateAxios.delete(`/integrations/meta/${id}`);
        return res.data;
    },

    getPage: async (pageId: string) => {
        const res = await PrivateAxios.get(
            `/integrations/meta/pages/${pageId}`
        );

        return res.data;
    },

    getPages: async (integrationId: string) => {
        const res = await PrivateAxios.get(
            `/integrations/meta/${integrationId}/pages`
        );

        return res.data.pages;
    },

    syncPages: async (integrationId: string) => {
        const res = await PrivateAxios.post(
            `/integrations/meta/${integrationId}/sync-pages`
        );

        return res.data;
    },

    getForms: async (pageId: string) => {
        const res = await PrivateAxios.get(`/integrations/meta/pages/${pageId}/forms`);
        return res.data;
    },

    syncForms: async (pageId: string) => {
        const res = await PrivateAxios.post(`/integrations/meta/pages/${pageId}/sync-forms`);
        return res.data;
    },
};