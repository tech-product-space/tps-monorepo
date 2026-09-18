import { create } from "zustand";

interface ProjectStore {
  showCreateForm: boolean;
  toggleCreateForm: () => void;
  setShowCreateForm: (show: boolean) => void;
}

export const useProjectStore = create<ProjectStore>((set) => ({
  showCreateForm: false,
  toggleCreateForm: () =>
    set((state) => ({ showCreateForm: !state.showCreateForm })),
  setShowCreateForm: (show) => set({ showCreateForm: show }),
}));
