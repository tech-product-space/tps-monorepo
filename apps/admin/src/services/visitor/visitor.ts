import { PrivateAxios } from "@/helpers/PrivateAxios";

interface GetAllVisitorPayload {
    page: number;
    limit: number;
    search?: string;
    blocked?: string | null;
}

export const getAllVisitors = async ({
    page = 1,
    limit = 20,
    search,
    blocked,
}: GetAllVisitorPayload) => {
    const response = await PrivateAxios.get("/visitor", {
        params: { page, limit, search, blocked },
    });
    return response;
};