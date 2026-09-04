/**
 * Spatial Memory Store
 *
 * Stores and recalls spatial memories - locations tagged with semantic meaning
 * Example: "Remember this is my desk" → stores position + label
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Vector3 } from '../types/spatial.types';

export interface SpatialMemory {
  id: string;
  position: Vector3;
  label: string; // "my desk", "the window", "plant area"
  description?: string; // Optional detailed description
  timestamp: number;
  createdBy: 'user' | 'ai';
}

interface SpatialMemoryState {
  memories: SpatialMemory[];

  // Actions
  addMemory: (position: Vector3, label: string, description?: string) => SpatialMemory;
  removeMemory: (id: string) => void;
  updateMemory: (id: string, updates: Partial<Omit<SpatialMemory, 'id' | 'timestamp'>>) => void;
  findNearbyMemories: (position: Vector3, radius: number) => SpatialMemory[];
  findMemoryByLabel: (label: string) => SpatialMemory | undefined;
  getAllMemories: () => SpatialMemory[];
  clearAllMemories: () => void;
}

/**
 * Calculate distance between two 3D points
 */
function distance3D(a: Vector3, b: Vector3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Generate unique ID for memory
 */
function generateMemoryId(): string {
  return `memory_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Spatial Memory Store
 */
export const useSpatialMemoryStore = create<SpatialMemoryState>()(
  persist(
    (set, get) => ({
      memories: [],

      /**
       * Add a new spatial memory
       */
      addMemory: (position: Vector3, label: string, description?: string) => {
        const memory: SpatialMemory = {
          id: generateMemoryId(),
          position,
          label: label.toLowerCase().trim(),
          description,
          timestamp: Date.now(),
          createdBy: 'user',
        };

        set((state) => ({
          memories: [...state.memories, memory],
        }));

        console.log(`[SpatialMemory] Added memory: "${label}" at position`, position);

        return memory;
      },

      /**
       * Remove a memory by ID
       */
      removeMemory: (id: string) => {
        set((state) => ({
          memories: state.memories.filter((m) => m.id !== id),
        }));

        console.log(`[SpatialMemory] Removed memory: ${id}`);
      },

      /**
       * Update an existing memory
       */
      updateMemory: (id: string, updates: Partial<Omit<SpatialMemory, 'id' | 'timestamp'>>) => {
        set((state) => ({
          memories: state.memories.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        }));

        console.log(`[SpatialMemory] Updated memory: ${id}`, updates);
      },

      /**
       * Find all memories within a radius of a position
       */
      findNearbyMemories: (position: Vector3, radius: number) => {
        const { memories } = get();
        const nearby: Array<SpatialMemory & { distance: number }> = [];

        memories.forEach((memory) => {
          const dist = distance3D(position, memory.position);
          if (dist <= radius) {
            nearby.push({ ...memory, distance: dist });
          }
        });

        // Sort by distance (closest first)
        nearby.sort((a, b) => a.distance - b.distance);

        console.log(`[SpatialMemory] Found ${nearby.length} memories within ${radius}m`);

        return nearby;
      },

      /**
       * Find a memory by its label (case-insensitive)
       */
      findMemoryByLabel: (label: string) => {
        const { memories } = get();
        const searchLabel = label.toLowerCase().trim();

        return memories.find((m) => m.label === searchLabel);
      },

      /**
       * Get all memories
       */
      getAllMemories: () => {
        return get().memories;
      },

      /**
       * Clear all memories
       */
      clearAllMemories: () => {
        set({ memories: [] });
        console.log('[SpatialMemory] Cleared all memories');
      },
    }),
    {
      name: 'spatial-memory-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

/**
 * Helper selectors
 */

// Get memory count
export const useMemoryCount = () =>
  useSpatialMemoryStore((state) => state.memories.length);

// Get all memory labels
export const useMemoryLabels = () =>
  useSpatialMemoryStore((state) => state.memories.map((m) => m.label));

// Get all memories
export const useAllMemories = () =>
  useSpatialMemoryStore((state) => state.memories);
