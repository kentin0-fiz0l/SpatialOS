/**
 * AI Store
 *
 * Manages AI conversation state and responses
 * Now with spatial memory command detection
 */

import { create } from 'zustand';
import type { Vector3 } from '../types/spatial.types';
import { ollamaService } from '../services/ollamaService';
import { useSpatialMemoryStore } from './spatialMemoryStore';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  position?: Vector3; // Where was the user when they asked?
}

interface CurrentResponse {
  text: string;
  position: Vector3; // Where to display the 3D bubble
  timestamp: number;
}

interface AIStoreState {
  // State
  conversationHistory: ConversationMessage[];
  currentResponse: CurrentResponse | null;
  isLoading: boolean;
  lastError: string | null;

  // Actions
  queryAI: (prompt: string, position: Vector3) => Promise<void>;
  rememberLocation: (position: Vector3, label: string, description?: string) => void;
  dismissResponse: () => void;
  clearHistory: () => void;
  setError: (error: string | null) => void;
}

/**
 * AI conversation store
 */
export const useAIStore = create<AIStoreState>((set, get) => ({
  // Initial state
  conversationHistory: [],
  currentResponse: null,
  isLoading: false,
  lastError: null,

  /**
   * Query the AI with a prompt
   */
  queryAI: async (prompt: string, position: Vector3) => {
    const state = get();

    // Don't queue multiple requests
    if (state.isLoading) {
      console.log('[AIStore] Already loading, ignoring new query');
      return;
    }

    // Set loading state
    set({ isLoading: true, lastError: null });

    try {
      console.log('[AIStore] Querying AI...', { prompt: prompt.substring(0, 50) });

      // Call Ollama service
      const response = await ollamaService.query(prompt);

      console.log('[AIStore] AI response received:', response);

      // Add to conversation history
      const userMessage: ConversationMessage = {
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
        position,
      };

      const assistantMessage: ConversationMessage = {
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };

      // Update state with response
      set({
        conversationHistory: [...state.conversationHistory, userMessage, assistantMessage],
        currentResponse: {
          text: response,
          position,
          timestamp: Date.now(),
        },
        isLoading: false,
      });
    } catch (error) {
      console.error('[AIStore] Query failed:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      set({
        isLoading: false,
        lastError: errorMessage,
      });
    }
  },

  /**
   * Remember a location with a semantic label
   */
  rememberLocation: (position: Vector3, label: string, description?: string) => {
    console.log('[AIStore] Remembering location:', label, 'at', position);

    // Add memory to spatial memory store
    const memory = useSpatialMemoryStore.getState().addMemory(position, label, description);

    // Show confirmation as AI response
    set({
      currentResponse: {
        text: `✓ Remembered "${label}" at this location`,
        position,
        timestamp: Date.now(),
      },
    });

    // Add to conversation history
    const state = get();
    const confirmationMessage: ConversationMessage = {
      role: 'assistant',
      content: `Spatial memory created: "${label}" at [${position[0].toFixed(2)}, ${position[1].toFixed(2)}, ${position[2].toFixed(2)}]`,
      timestamp: Date.now(),
    };

    set({
      conversationHistory: [...state.conversationHistory, confirmationMessage],
    });

    return memory;
  },

  /**
   * Dismiss the current response bubble
   */
  dismissResponse: () => {
    console.log('[AIStore] Dismissing response');
    set({ currentResponse: null });
  },

  /**
   * Clear conversation history
   */
  clearHistory: () => {
    console.log('[AIStore] Clearing conversation history');
    set({
      conversationHistory: [],
      currentResponse: null,
      lastError: null,
    });
  },

  /**
   * Set error message
   */
  setError: (error: string | null) => {
    set({ lastError: error });
  },
}));

/**
 * Helper selectors
 */

// Get loading state
export const useAILoading = () => useAIStore((state) => state.isLoading);

// Get current response
export const useCurrentResponse = () => useAIStore((state) => state.currentResponse);

// Get conversation history
export const useConversationHistory = () => useAIStore((state) => state.conversationHistory);

// Get last error
export const useAIError = () => useAIStore((state) => state.lastError);
