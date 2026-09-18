import { create } from "zustand";

interface BlogStore {
  showCreateForm: boolean;
  toggleCreateForm: () => void;
  setShowCreateForm: (show: boolean) => void;
}

export const useBlogStore = create<BlogStore>((set) => ({
  showCreateForm: false,
  toggleCreateForm: () => set((state) => ({ showCreateForm: !state.showCreateForm })),
  setShowCreateForm: (show) => set({ showCreateForm: show }),
}));
