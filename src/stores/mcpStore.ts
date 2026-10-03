/**
 * MCP Store
 * Connection state of the voice bridge (mcpClient), for the status bar.
 */

import { create } from 'zustand';

interface MCPStoreState {
  connected: boolean;
  setConnected: (connected: boolean) => void;
}

export const useMCPStore = create<MCPStoreState>((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),
}));

export const useMCPConnected = () => useMCPStore((s) => s.connected);
