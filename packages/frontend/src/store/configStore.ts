import { create } from 'zustand';
import type { PixdashConfig } from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

interface ConfigState {
  config: PixdashConfig;
  isLoaded: boolean;
  fetchConfig: () => Promise<void>;
  updateDisplayName: (agentId: string, displayName: string) => Promise<boolean>;
  updateRole: (agentId: string, role: string) => Promise<boolean>;
  updateHierarchy: (child: string, newParent: string | null) => Promise<boolean>;
  resetToDefaults: () => Promise<boolean>;
}

async function apiPatch<T>(path: string, body: unknown): Promise<{ success: boolean } & T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<{ success: boolean } & T>;
}

export const configStore = create<ConfigState>()((set) => ({
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
  updateDisplayName: async (agentId, displayName) => {
    try {
      const result = await apiPatch<{ displayNames: Record<string, string> }>('/config/displayNames', { agentId, displayName });
      // Optimistic merge — server returned authoritative state
      set((s) => ({ config: { ...s.config, displayNames: result.displayNames } }));
      return true;
    } catch {
      return false;
    }
  },
  updateRole: async (agentId, role) => {
    try {
      const result = await apiPatch<{ roles: Record<string, string> }>('/config/roles', { agentId, role });
      set((s) => ({ config: { ...s.config, roles: result.roles } }));
      return true;
    } catch {
      return false;
    }
  },
  updateHierarchy: async (child, newParent) => {
    try {
      const result = await apiPatch<{ hierarchy: PixdashConfig['hierarchy'] }>('/config/hierarchy', { child, newParent });
      set((s) => ({ config: { ...s.config, hierarchy: result.hierarchy } }));
      return true;
    } catch {
      return false;
    }
  },
  resetToDefaults: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/config/reset`, { method: 'POST' });
      if (!res.ok) return false;
      const result = await res.json() as { success: boolean } & PixdashConfig;
      set({
        config: {
          displayNames: result.displayNames ?? {},
          roles: result.roles ?? {},
          hierarchy: result.hierarchy ?? [],
        },
      });
      return true;
    } catch {
      return false;
    }
  },
}));

export const useConfigStore = configStore;
