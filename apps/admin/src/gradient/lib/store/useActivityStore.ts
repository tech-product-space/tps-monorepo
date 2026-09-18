import { create } from "zustand";

import type { ActivityStatus } from "@/gradient/types/activity";

/**
 * Filter state for the activity feed, kept in a store so navigating to a record
 * and back does not reset a filter the admin just set up.
 */
interface ActivityStoreState {
  actorId: string | null;
  entityType: string | null;
  action: string | null;
  status: ActivityStatus | null;
  dateFrom: string | null;
  dateTo: string | null;
  search: string;
  page: number;
  limit: number;

  setFilter: (
    patch: Partial<
      Omit<ActivityStoreState, "setFilter" | "setPage" | "setLimit" | "reset">
    >,
  ) => void;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  reset: () => void;
}

const INITIAL = {
  actorId: null,
  entityType: null,
  action: null,
  status: null,
  dateFrom: null,
  dateTo: null,
  search: "",
  page: 1,
  limit: 20,
};

export const useActivityStore = create<ActivityStoreState>((set) => ({
  ...INITIAL,

  // Any filter change returns to page 1 — otherwise a narrower filter can land
  // on a page that no longer exists and the table reads as empty.
  setFilter: (patch) => set({ ...patch, page: 1 }),
  setPage: (page) => set({ page }),
  setLimit: (limit) => set({ limit, page: 1 }),
  reset: () => set(INITIAL),
}));
