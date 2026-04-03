import { create } from 'zustand';

export type PanelTab = 'status' | 'config' | 'logs' | 'tasks';

interface UIState {
  panelOpen: boolean;
  panelTab: PanelTab;
  customizerOpen: boolean;
  isCustomizerOpen: boolean;
  isSidebarCollapsed: boolean;
  openPanel: () => void;
  closePanel: () => void;
  setPanelTab: (tab: PanelTab) => void;
  openCustomizer: () => void;
  closeCustomizer: () => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  panelOpen: false,
  panelTab: 'status',
  customizerOpen: false,
  isCustomizerOpen: false,
  isSidebarCollapsed: false,
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  setPanelTab: (panelTab) => set({ panelTab }),
  openCustomizer: () => set({ customizerOpen: true, isCustomizerOpen: true }),
  closeCustomizer: () => set({ customizerOpen: false, isCustomizerOpen: false }),
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed }))
}));

export const uiStore = {
  getState: useUIStore.getState,
  subscribe: useUIStore.subscribe,
  openPanel: useUIStore.getState().openPanel,
  closePanel: useUIStore.getState().closePanel,
  setPanelTab: useUIStore.getState().setPanelTab,
  openCustomizer: useUIStore.getState().openCustomizer,
  closeCustomizer: useUIStore.getState().closeCustomizer,
  get isCustomizerOpen() {
    return useUIStore.getState().customizerOpen;
  },
  get isSidebarCollapsed() {
    return useUIStore.getState().isSidebarCollapsed;
  },
  toggleSidebar: useUIStore.getState().toggleSidebar
};
