import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'dark' | 'light';

interface SettingsState {
  theme: ThemeMode;
  zoom: number;
  setTheme: (theme: ThemeMode) => void;
  setZoom: (zoom: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      zoom: 1,
      setTheme: (theme) => set({ theme }),
      setZoom: (zoom) => set({ zoom })
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
