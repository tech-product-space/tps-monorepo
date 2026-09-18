import { create } from "zustand";

interface RecordingStore {
  showCreateForm: boolean;
  toggleCreateForm: () => void;
  setShowCreateForm: (show: boolean) => void;
}

export const useRecordingStore = create<RecordingStore>((set) => ({
  showCreateForm: false,
  toggleCreateForm: () =>
    set((state) => ({ showCreateForm: !state.showCreateForm })),
  setShowCreateForm: (show) => set({ showCreateForm: show }),
}));
