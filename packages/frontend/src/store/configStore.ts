import { create } from 'zustand';
import type { PixdashConfig } from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

interface ConfigState {
  config: PixdashConfig;
  isLoaded: boolean;
  fetchConfig: () => Promise<void>;
}

export const useConfigStore = create<ConfigState>()((set) => ({
  config: {
    displayNames: {},
    roles: {},
    hierarchy: [],
  },
  isLoaded: false,
  fetchConfig: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/config`);
      if (!res.ok) return;
      const data: PixdashConfig = await res.json();
      set({
        config: {
          displayNames: data.displayNames ?? {},
          roles: data.roles ?? {},
          hierarchy: data.hierarchy ?? [],
        },
        isLoaded: true,
      });
    } catch {
      // Fail gracefully — empty config is the default
      set({ isLoaded: true });
    }
  },
}));
