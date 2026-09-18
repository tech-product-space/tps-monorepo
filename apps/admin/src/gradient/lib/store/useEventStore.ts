import { create } from "zustand";

interface EventStore {
  showCreateForm: boolean;
  toggleCreateForm: () => void;
  setShowCreateForm: (show: boolean) => void;
}

export const useEventStore = create<EventStore>((set) => ({
  showCreateForm: false,
  toggleCreateForm: () => set((state) => ({ showCreateForm: !state.showCreateForm })),
  setShowCreateForm: (show) => set({ showCreateForm: show }),
}));
