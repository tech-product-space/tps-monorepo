import { PrivateAxios } from "@/helpers/PrivateAxios"
import { IExternalLead } from "@/types/externalLead"
import { IPaginationMeta } from "@/types/pagination"

export interface CreateLeadTypePayload {
    name: string
    description?: string
}

export interface MapMetaFormsPayload {
    formId: string
    typeIds: string[]
}

export interface LeadType {
    id: string
    name: string
    description?: string
    createdAt: string
}

interface GetMetaLeadsParams {
    typeId?: string
    search?: string
    sort?: "meta" | "created"
    page?: number
    limit?: number
    campaign: string
    adset: string
    ad: string
}

interface GetMetaLeadsResponse {
    leads: IExternalLead[]
    meta: IPaginationMeta;
}

export interface MetaFormOption {
    id: string
    form_id: string
    form_name: string | null
    status: string | null
    page_name: string | null
    leadTypes: { id: string; name: string }[]
}

export const externalLeadService = {

    createLeadType: async (payload: CreateLeadTypePayload) => {

        const res = await PrivateAxios.post(
            "/leads/external/lead-types",
            payload
        )

        return res.data

    },


    getLeadTypes: async (): Promise<{ types: LeadType[] }> => {

        const res = await PrivateAxios.get(
            "/leads/external/lead-types"
        )

        return res.data

    },


    /* ---------------- MAP META FORM → LEAD TYPES ---------------- */

    mapMetaForms: async (payload: MapMetaFormsPayload) => {

        const res = await PrivateAxios.post(
            "/leads/external/lead-types/map/meta-form",
            payload
        )

        return res.data

    },

    syncMetaFormLeads: async (formId: string) => {
        const res = await PrivateAxios.post(`/leads/external/meta/forms/${formId}/sync-leads`)
        return res.data
    },

    getMetaLeads: async (params?: GetMetaLeadsParams): Promise<GetMetaLeadsResponse> => {

        const res = await PrivateAxios.get("/leads/external/meta", {
            params
        })

        return res.data
    },

    getMetaLeadFilters: async (): Promise<{
        campaigns: string[],
        adsets: string[],
        ads: string[],
    }> => {
        const res = await PrivateAxios.get("/leads/external/meta/filters")
        return res.data
    },

    /** All Meta forms across every page, with page name + mapped lead types.
     *  Used by the workflow live-trigger source picker. */
    getAllMetaForms: async (): Promise<{ forms: MetaFormOption[] }> => {
        const res = await PrivateAxios.get("/leads/external/meta/forms")
        return res.data
    }

}