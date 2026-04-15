import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'dark' | 'light';

interface SettingsState {
  theme: ThemeMode;
  zoom: number;
  showLabels: boolean;
  setTheme: (theme: ThemeMode) => void;
  setZoom: (zoom: number) => void;
  setShowLabels: (show: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      zoom: 1,
      showLabels: true,
      setTheme: (theme) => set({ theme }),
      setZoom: (zoom) => set({ zoom }),
      setShowLabels: (showLabels) => set({ showLabels }),
    }),
    {
      name: 'pixdash-settings'
    }
  )
);

export const settingsStore = {
  getState: useSettingsStore.getState,
  subscribe: useSettingsStore.subscribe
};
