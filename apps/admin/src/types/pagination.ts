export interface IPaginationMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number,
    hasNextPage: boolean,
    hasPrevPage: boolean,
}