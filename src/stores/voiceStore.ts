/**
 * Voice Store
 *
 * Manages voice recognition state
 */

import { create } from 'zustand';

interface VoiceStoreState {
  // State
  isListening: boolean;
  isAvailable: boolean;
  currentTranscript: string;
  lastCommand: string | null;
  error: string | null;

  // Actions
  setListening: (listening: boolean) => void;
  setAvailable: (available: boolean) => void;
  setTranscript: (transcript: string) => void;
  setLastCommand: (command: string) => void;
  setError: (error: string | null) => void;
  clearTranscript: () => void;
}

export const useVoiceStore = create<VoiceStoreState>((set) => ({
  isListening: false,
  isAvailable: false,
  currentTranscript: '',
  lastCommand: null,
  error: null,

  setListening: (listening) => set({ isListening: listening }),
  setAvailable: (available) => set({ isAvailable: available }),
  setTranscript: (transcript) => set({ currentTranscript: transcript }),
  setLastCommand: (command) => set({ lastCommand: command }),
  setError: (error) => set({ error }),
  clearTranscript: () => set({ currentTranscript: '', lastCommand: null }),
}));

// Helper selectors
export const useIsListening = () => useVoiceStore((state) => state.isListening);
export const useVoiceAvailable = () => useVoiceStore((state) => state.isAvailable);
export const useCurrentTranscript = () => useVoiceStore((state) => state.currentTranscript);
export const useLastCommand = () => useVoiceStore((state) => state.lastCommand);
export const useVoiceError = () => useVoiceStore((state) => state.error);
