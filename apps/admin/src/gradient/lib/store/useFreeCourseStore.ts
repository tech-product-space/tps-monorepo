import { create } from "zustand";

interface FreeCourseStore {
  showCreateForm: boolean;
  toggleCreateForm: () => void;
  setShowCreateForm: (show: boolean) => void;
}

export const useFreeCourseStore = create<FreeCourseStore>((set) => ({
  showCreateForm: false,

  toggleCreateForm: () =>
    set((state) => ({
      showCreateForm: !state.showCreateForm,
    })),

  setShowCreateForm: (show) =>
    set({
      showCreateForm: show,
    }),
}));