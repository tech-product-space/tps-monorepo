import { create } from "zustand";

interface ResourceStore {
  showCreateForm: boolean;
  toggleCreateForm: () => void;
  setShowCreateForm: (show: boolean) => void;
}

export const useResourceStore = create<ResourceStore>((set) => ({
  showCreateForm: false,
  toggleCreateForm: () => set((state) => ({ showCreateForm: !state.showCreateForm })),
  setShowCreateForm: (show) => set({ showCreateForm: show }),
}));
